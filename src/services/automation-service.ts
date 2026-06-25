import {
  AutomationActionType,
  AutomationTriggerType,
  Channel,
  ChannelType,
  ContactStatus,
  ConversationStatus,
  MessageSender,
  MessageType,
  Prisma,
} from "@prisma/client";
import type {
  AutomationRule,
  Contact,
  Conversation,
  Message,
} from "@prisma/client";
import { prisma } from "../lib/prisma";
import { emitRealtime } from "../lib/realtime";
import { log } from "../lib/logger";
import {
  adapterFromAccount,
  getChannelAdapter,
} from "../lib/channels/registry";
import {
  extractTemplateVariables,
  getApprovedTemplate,
} from "../lib/whatsapp";
import { getWhatsAppAccountForOrg } from "./channel-account-service";
import { recordMessage, requestHumanHandoff } from "./conversation-service";
import { syncLeadToOdoo } from "./odoo-service";

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function listAutomationRules(organizationId: string) {
  return prisma.automationRule.findMany({
    where: { organizationId },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });
}

export async function createAutomationRule(
  organizationId: string,
  input: {
    name: string;
    enabled?: boolean;
    priority?: number;
    trigger: AutomationTriggerType;
    triggerConfig?: unknown;
    action: AutomationActionType;
    actionConfig?: unknown;
  },
) {
  return prisma.automationRule.create({
    data: {
      organizationId,
      name: input.name,
      enabled: input.enabled ?? true,
      priority: input.priority ?? 0,
      trigger: input.trigger,
      triggerConfig: (input.triggerConfig ?? {}) as Prisma.InputJsonValue,
      action: input.action,
      actionConfig: (input.actionConfig ?? {}) as Prisma.InputJsonValue,
    },
  });
}

export async function updateAutomationRule(
  organizationId: string,
  id: string,
  input: {
    name?: string;
    enabled?: boolean;
    priority?: number;
    trigger?: AutomationTriggerType;
    triggerConfig?: unknown;
    action?: AutomationActionType;
    actionConfig?: unknown;
  },
) {
  const owned = await prisma.automationRule.findFirst({
    where: { id, organizationId },
    select: { id: true },
  });
  if (!owned) return null;
  return prisma.automationRule.update({
    where: { id },
    data: {
      name: input.name,
      enabled: input.enabled,
      priority: input.priority,
      trigger: input.trigger,
      triggerConfig:
        input.triggerConfig === undefined
          ? undefined
          : (input.triggerConfig as Prisma.InputJsonValue),
      action: input.action,
      actionConfig:
        input.actionConfig === undefined
          ? undefined
          : (input.actionConfig as Prisma.InputJsonValue),
    },
  });
}

export async function deleteAutomationRule(organizationId: string, id: string) {
  const owned = await prisma.automationRule.findFirst({
    where: { id, organizationId },
    select: { id: true },
  });
  if (!owned) return false;
  await prisma.automationRule.delete({ where: { id } });
  return true;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export type AutomationEvent =
  | "new_conversation"
  | "new_message"
  | "tag_added"
  | "scheduled";

type AutomationContext = {
  organizationId: string;
  event: AutomationEvent;
  contact: Contact;
  conversation: Conversation;
  message?: Message | null;
  addedTag?: string | null;
};

/** Triggers that this engine evaluates against an inbound event. */
const EVENT_TRIGGERS: Record<AutomationEvent, AutomationTriggerType[]> = {
  new_conversation: [AutomationTriggerType.NEW_CONVERSATION],
  new_message: [
    AutomationTriggerType.NEW_MESSAGE,
    AutomationTriggerType.MESSAGE_KEYWORD,
    AutomationTriggerType.CHANNEL_IS,
  ],
  tag_added: [AutomationTriggerType.TAG_ADDED],
  // Time-based triggers are evaluated by runScheduledAutomations, not the
  // inbound-event path.
  scheduled: [],
};

function ruleMatches(rule: AutomationRule, ctx: AutomationContext): boolean {
  const config = (rule.triggerConfig ?? {}) as Record<string, unknown>;

  switch (rule.trigger) {
    case AutomationTriggerType.NEW_CONVERSATION:
      return ctx.event === "new_conversation";
    case AutomationTriggerType.NEW_MESSAGE:
      return ctx.event === "new_message";
    case AutomationTriggerType.MESSAGE_KEYWORD: {
      const text = ctx.message?.content?.toLowerCase() ?? "";
      const keywords = (config.keywords as string[] | undefined) ?? [];
      return keywords.some((kw) => text.includes(String(kw).toLowerCase()));
    }
    case AutomationTriggerType.CHANNEL_IS: {
      const wanted = String(config.channel ?? "").toUpperCase();
      return wanted ? ctx.contact.channel === (wanted as Channel) : false;
    }
    case AutomationTriggerType.TAG_ADDED: {
      const wanted = config.tag ? String(config.tag) : null;
      if (!wanted) return ctx.event === "tag_added";
      return ctx.event === "tag_added" && ctx.addedTag === wanted;
    }
    default:
      // OUTSIDE_BUSINESS_HOURS / NO_REPLY_AFTER are time-based and handled by a
      // scheduler, not the inbound-event path.
      return false;
  }
}

async function applyAction(rule: AutomationRule, ctx: AutomationContext) {
  const config = (rule.actionConfig ?? {}) as Record<string, unknown>;

  switch (rule.action) {
    case AutomationActionType.ADD_TAG: {
      const tag = config.tag ? String(config.tag) : null;
      if (!tag || ctx.contact.tags.includes(tag)) return;
      await prisma.contact.update({
        where: { id: ctx.contact.id },
        data: { tags: { push: tag } },
      });
      break;
    }
    case AutomationActionType.ASSIGN_AGENT: {
      const agentId = config.agentId ? String(config.agentId) : null;
      if (!agentId) return;
      const updated = await prisma.conversation.update({
        where: { id: ctx.conversation.id },
        data: { assignedAgentId: agentId, status: ConversationStatus.HUMAN },
        include: {
          contact: true,
          assignedAgent: {
            select: { id: true, name: true, email: true, availability: true },
          },
        },
      });
      await prisma.contact.update({
        where: { id: ctx.contact.id },
        data: { assignedAgentId: agentId },
      });
      await emitRealtime({ type: "conversation.updated", payload: updated });
      break;
    }
    case AutomationActionType.NOTIFY: {
      const userId = config.userId ? String(config.userId) : ctx.conversation.assignedAgentId;
      if (!userId) return;
      await prisma.notification.create({
        data: {
          userId,
          type: "CUSTOMER_REPLIED",
          title: String(config.title ?? "Automation triggered"),
          body: String(config.body ?? `Rule "${rule.name}" fired.`),
          metadata: { conversationId: ctx.conversation.id, ruleId: rule.id },
        },
      });
      break;
    }
    case AutomationActionType.CLOSE: {
      const updated = await prisma.conversation.update({
        where: { id: ctx.conversation.id },
        data: { status: ConversationStatus.CLOSED, closedAt: new Date() },
        include: { contact: true },
      });
      await emitRealtime({ type: "conversation.updated", payload: updated });
      break;
    }
    case AutomationActionType.SNOOZE: {
      const minutes = Number(config.minutes ?? 60);
      await prisma.conversation.update({
        where: { id: ctx.conversation.id },
        data: { snoozedUntil: new Date(Date.now() + minutes * 60000) },
      });
      break;
    }
    case AutomationActionType.SEND_WEBHOOK: {
      const url = config.url ? String(config.url) : null;
      if (!url) return;
      await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rule: rule.name,
          event: ctx.event,
          contactId: ctx.contact.id,
          conversationId: ctx.conversation.id,
          message: ctx.message?.content ?? null,
        }),
      }).catch((error) => log.error("automation webhook failed", error, { ruleId: rule.id }));
      break;
    }
    case AutomationActionType.SEND_TEMPLATE: {
      await sendTemplateToContact(ctx.organizationId, ctx.contact, {
        templateName: config.templateName ? String(config.templateName) : null,
        templateLanguage: config.templateLanguage
          ? String(config.templateLanguage)
          : null,
      });
      break;
    }
    case AutomationActionType.CREATE_LEAD: {
      const tag = config.tag ? String(config.tag) : "lead";
      const tags = ctx.contact.tags.includes(tag)
        ? ctx.contact.tags
        : [...ctx.contact.tags, tag];
      await prisma.contact.update({
        where: { id: ctx.contact.id },
        data: { tags, status: ContactStatus.ACTIVE },
      });
      if (process.env.ODOO_SYNC_ENABLED === "true") {
        await syncLeadToOdoo(
          ctx.contact.id,
          String(config.description ?? `Lead created by rule "${rule.name}".`),
        ).catch((error) =>
          log.error("automation create_lead odoo sync failed", error, {
            ruleId: rule.id,
          }),
        );
      }
      break;
    }
    case AutomationActionType.HANDOFF_BOTPRESS: {
      // Pause the bot and hand the conversation to a human. Reuses the same
      // path the bot uses when it explicitly requests handoff.
      await requestHumanHandoff(ctx.contact.id);
      await recordMessage({
        contactId: ctx.contact.id,
        content: config.message
          ? String(config.message)
          : `Bot paused — handed off to a human by rule "${rule.name}".`,
        sender: MessageSender.SYSTEM,
        type: MessageType.NOTE,
        isNote: true,
        organizationId: ctx.organizationId,
        metadata: { automationRuleId: rule.id, handoff: true },
      });
      break;
    }
    default:
      log.info("automation action has no handler", {
        action: rule.action,
        ruleId: rule.id,
      });
  }
}

/**
 * Sends an approved WhatsApp template to a contact through the WhatsApp Cloud
 * adapter. Used by the SEND_TEMPLATE automation action. Best-effort fills any
 * template variables with the contact name.
 */
async function sendTemplateToContact(
  organizationId: string,
  contact: Contact,
  input: { templateName: string | null; templateLanguage: string | null },
) {
  if (!input.templateName) {
    throw new Error("SEND_TEMPLATE requires a templateName.");
  }
  if (!contact.phone) {
    throw new Error("Contact has no phone number for a WhatsApp template.");
  }

  const template = await getApprovedTemplate(
    input.templateName,
    input.templateLanguage,
  );
  if (!template) throw new Error("SEND_TEMPLATE requires a templateName.");
  const account = await getWhatsAppAccountForOrg(organizationId);
  const adapter = account
    ? adapterFromAccount(account)
    : getChannelAdapter(ChannelType.WHATSAPP_CLOUD);
  const variables = extractTemplateVariables(template.components).map(
    () => contact.name ?? contact.phone ?? "",
  );

  const result = await adapter.sendMessage({
    to: contact.phone,
    type: MessageType.TEXT,
    template: {
      name: template.name,
      language: template.language,
      variables,
    },
    metadata: { source: "automation" },
  });

  if (!result.ok && !result.skipped) {
    throw new Error(result.error ?? "template_send_failed");
  }
  if (result.skipped) return;

  await recordMessage({
    contactId: contact.id,
    content: template.name,
    sender: MessageSender.BOT,
    type: MessageType.TEXT,
    organizationId,
    channelAccountId: account?.id ?? null,
    externalId: result.externalId ?? null,
    metadata: { template: template.name, source: "automation" },
  });
}

/**
 * Evaluates enabled rules for an inbound event and applies matching actions in
 * priority order. Failures are isolated per-rule so one bad rule never blocks
 * message ingestion.
 */
export async function runAutomations(ctx: AutomationContext) {
  const triggers = EVENT_TRIGGERS[ctx.event];
  if (!triggers?.length) return;

  const rules = await prisma.automationRule.findMany({
    where: {
      organizationId: ctx.organizationId,
      enabled: true,
      trigger: { in: triggers },
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });

  for (const rule of rules) {
    try {
      if (!ruleMatches(rule, ctx)) continue;
      await applyAction(rule, ctx);
      await prisma.automationRule.update({
        where: { id: rule.id },
        data: { lastRunAt: new Date(), runCount: { increment: 1 } },
      });
    } catch (error) {
      log.error("automation rule failed", error, { ruleId: rule.id });
    }
  }
}

// ---------------------------------------------------------------------------
// Scheduler (time-based triggers)
// ---------------------------------------------------------------------------

const SCHEDULED_TRIGGERS = [
  AutomationTriggerType.NO_REPLY_AFTER,
  AutomationTriggerType.OUTSIDE_BUSINESS_HOURS,
] as const;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function currentMinutesInZone(timeZone: string, now: Date): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    return (hour % 24) * 60 + minute;
  } catch {
    return now.getUTCHours() * 60 + now.getUTCMinutes();
  }
}

/**
 * True when `now` falls outside the [start, end) business-hours window for the
 * given timezone. Windows may wrap past midnight.
 */
export function isOutsideBusinessHours(
  start: string,
  end: string,
  timezone: string,
  now = new Date(),
): boolean {
  const current = currentMinutesInZone(timezone, now);
  const startM = toMinutes(start);
  const endM = toMinutes(end);
  if (startM === endM) return false;
  const inside =
    startM < endM
      ? current >= startM && current < endM
      : current >= startM || current < endM;
  return !inside;
}

/**
 * Has this rule already fired for the contact's current unanswered turn? We
 * write a SYSTEM note marker whenever a scheduled rule fires and skip if one
 * exists since the last inbound customer message.
 */
async function alreadyFiredThisTurn(
  ruleId: string,
  contactId: string,
  since: Date | null,
): Promise<boolean> {
  const marker = await prisma.message.findFirst({
    where: {
      contactId,
      isNote: true,
      createdAt: since ? { gte: since } : undefined,
      metadata: { path: ["automationRuleId"], equals: ruleId },
    },
    select: { id: true },
  });
  return Boolean(marker);
}

async function writeScheduledMarker(
  rule: AutomationRule,
  contactId: string,
  organizationId: string,
) {
  await prisma.message.create({
    data: {
      contactId,
      organizationId,
      content: `Automation "${rule.name}" fired.`,
      sender: MessageSender.SYSTEM,
      type: MessageType.NOTE,
      isNote: true,
      metadata: { automationRuleId: rule.id, scheduled: true },
    },
  });
}

/**
 * Evaluates time-based automation rules (NO_REPLY_AFTER, OUTSIDE_BUSINESS_HOURS)
 * against open conversations and applies matching actions. Designed to be run
 * on an interval (worker) or hit by an external cron via the API route.
 *
 * Idempotent per unanswered customer turn: a rule fires at most once until the
 * customer sends another message.
 */
export async function runScheduledAutomations(options?: {
  organizationId?: string;
  now?: Date;
}): Promise<{ evaluated: number; fired: number }> {
  const now = options?.now ?? new Date();
  const rules = await prisma.automationRule.findMany({
    where: {
      enabled: true,
      trigger: { in: [...SCHEDULED_TRIGGERS] },
      organizationId: options?.organizationId,
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });

  let evaluated = 0;
  let fired = 0;

  for (const rule of rules) {
    const config = (rule.triggerConfig ?? {}) as Record<string, unknown>;

    // Open conversations with an unanswered inbound message in this workspace.
    const conversations = await prisma.conversation.findMany({
      where: {
        organizationId: rule.organizationId,
        status: { not: ConversationStatus.CLOSED },
        lastCustomerMessageAt: { not: null },
      },
      include: { contact: true },
      take: 500,
    });

    for (const conversation of conversations) {
      const lastCustomer = conversation.lastCustomerMessageAt;
      if (!lastCustomer) continue;
      // "Unanswered" means no agent/bot message landed after the customer's.
      const answered =
        conversation.lastMessageAt != null &&
        conversation.lastMessageAt.getTime() > lastCustomer.getTime();
      if (answered) continue;

      evaluated += 1;

      let matches = false;
      if (rule.trigger === AutomationTriggerType.NO_REPLY_AFTER) {
        const minutes = Number(config.minutes ?? 60);
        matches = now.getTime() - lastCustomer.getTime() >= minutes * 60000;
      } else {
        const start = String(config.start ?? "09:00");
        const end = String(config.end ?? "17:00");
        const timezone = String(config.timezone ?? "Africa/Cairo");
        matches = isOutsideBusinessHours(start, end, timezone, now);
      }
      if (!matches) continue;

      if (await alreadyFiredThisTurn(rule.id, conversation.contactId, lastCustomer)) {
        continue;
      }

      try {
        await applyAction(rule, {
          organizationId: rule.organizationId,
          event: "scheduled",
          contact: conversation.contact,
          conversation,
        });
        await writeScheduledMarker(rule, conversation.contactId, rule.organizationId);
        fired += 1;
      } catch (error) {
        log.error("scheduled automation failed", error, {
          ruleId: rule.id,
          conversationId: conversation.id,
        });
      }
    }

    await prisma.automationRule.update({
      where: { id: rule.id },
      data: { lastRunAt: now },
    });
  }

  return { evaluated, fired };
}
