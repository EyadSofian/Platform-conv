import {
  AutomationActionType,
  AutomationTriggerType,
  Channel,
  ConversationStatus,
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
  | "tag_added";

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
    default:
      // SEND_TEMPLATE / CREATE_LEAD / HANDOFF_BOTPRESS are scaffolded for later.
      log.info("automation action not yet implemented", {
        action: rule.action,
        ruleId: rule.id,
      });
  }
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
