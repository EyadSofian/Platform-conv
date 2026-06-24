import {
  CampaignStatus,
  CampaignType,
  Channel,
  ChannelType,
  ContactStatus,
  MessageSender,
  MessageType,
  Prisma,
} from "@prisma/client";
import type { Contact } from "@prisma/client";
import { sendBotPressMessage } from "../lib/botpress";
import {
  adapterFromAccount,
  getChannelAdapter,
} from "../lib/channels/registry";
import { emitRealtime } from "../lib/realtime";
import { prisma } from "../lib/prisma";
import {
  assertMarketingEligible,
  extractTemplateVariables,
  getApprovedTemplate,
} from "../lib/whatsapp";
import { getWhatsAppAccountForOrg } from "./channel-account-service";
import { recordMessage } from "./conversation-service";

export type CampaignTargetRules = {
  tags?: string[];
  status?: string[];
  agentId?: string | null;
  channel?: string[];
  dateFrom?: string;
  dateTo?: string;
};

export function buildContactWhereFromRules(
  rules: CampaignTargetRules,
  organizationId?: string | null,
): Prisma.ContactWhereInput {
  return {
    organizationId: organizationId ?? undefined,
    assignedAgentId: rules.agentId || undefined,
    tags: rules.tags?.length ? { hasSome: rules.tags } : undefined,
    status: rules.status?.length
      ? { in: rules.status.map((status) => status.toUpperCase() as ContactStatus) }
      : undefined,
    channel: rules.channel?.length
      ? { in: rules.channel.map((channel) => channel.toUpperCase() as Channel) }
      : undefined,
    createdAt:
      rules.dateFrom || rules.dateTo
        ? {
            gte: rules.dateFrom ? new Date(rules.dateFrom) : undefined,
            lte: rules.dateTo ? new Date(rules.dateTo) : undefined,
          }
        : undefined,
  };
}

export async function createCampaign(input: {
  organizationId?: string | null;
  name: string;
  message: string;
  type: CampaignType;
  status: CampaignStatus;
  targetRules: CampaignTargetRules;
  channel: Channel;
  templateName?: string | null;
  templateLanguage?: string | null;
  respectOptIn: boolean;
  rateLimitPerMinute: number;
  quietHoursStart: string;
  quietHoursEnd: string;
  timezone: string;
  scheduledAt?: string | null;
  createdById: string;
}) {
  if (input.channel === Channel.WHATSAPP && input.templateName) {
    await getApprovedTemplate(input.templateName, input.templateLanguage);
  }

  return prisma.campaign.create({
    data: {
      organizationId: input.organizationId ?? undefined,
      name: input.name,
      message: input.message,
      type: input.type,
      status: input.status,
      targetRules: input.targetRules as Prisma.InputJsonObject,
      channel: input.channel,
      templateName: input.templateName,
      templateLanguage: input.templateLanguage,
      respectOptIn: input.respectOptIn,
      rateLimitPerMinute: input.rateLimitPerMinute,
      quietHoursStart: input.quietHoursStart,
      quietHoursEnd: input.quietHoursEnd,
      timezone: input.timezone,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      createdById: input.createdById,
    },
  });
}

function skipReasonForContact(
  campaign: { channel: Channel; respectOptIn: boolean },
  contact: Contact,
): string | null {
  if (campaign.channel === Channel.WHATSAPP) {
    if (campaign.respectOptIn) {
      const reason = assertMarketingEligible({
        phone: contact.phone,
        whatsappOptIn: contact.whatsappOptIn,
        marketingPaused: contact.marketingPaused,
        unsubscribed: contact.unsubscribed,
      });
      if (reason) return reason;
    } else if (!contact.phone) {
      return "missing_phone";
    }
    if (contact.unsubscribed) return "unsubscribed";
    return null;
  }
  // BotPress / other channels need a linked conversation.
  if (!contact.botpressUserId || !contact.botpressConvId) {
    return "missing_botpress_link";
  }
  return null;
}

/**
 * Dry-run validation: resolves the audience and reports how many contacts are
 * eligible vs skipped (with reasons), without sending anything.
 */
export async function validateCampaignRecipients(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error("Campaign not found.");

  const rules = campaign.targetRules as CampaignTargetRules;
  const contacts = await prisma.contact.findMany({
    where: buildContactWhereFromRules(rules, campaign.organizationId),
    take: 5000,
  });

  const skippedByReason: Record<string, number> = {};
  let eligible = 0;
  for (const contact of contacts) {
    const reason = skipReasonForContact(campaign, contact);
    if (reason) {
      skippedByReason[reason] = (skippedByReason[reason] ?? 0) + 1;
    } else {
      eligible += 1;
    }
  }

  return {
    total: contacts.length,
    eligible,
    skipped: contacts.length - eligible,
    skippedByReason,
    templateRequired: campaign.channel === Channel.WHATSAPP,
    templateName: campaign.templateName,
  };
}

/**
 * Returns true when the current moment falls inside the campaign's quiet hours
 * for its timezone. Quiet windows may wrap past midnight (e.g. 21:00–09:00).
 */
export function isWithinQuietHours(
  start: string | null,
  end: string | null,
  timezone: string | null,
  now = new Date(),
): boolean {
  if (!start || !end) return false;
  const current = currentMinutesInZone(timezone ?? "UTC", now);
  const startM = toMinutes(start);
  const endM = toMinutes(end);
  if (startM === endM) return false;
  if (startM < endM) {
    return current >= startM && current < endM;
  }
  // Wrapping window (overnight).
  return current >= startM || current < endM;
}

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

async function bumpCampaignCounters(
  campaignId: string,
  counters: { sent?: number; skipped?: number; failed?: number; queued?: number },
) {
  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      sentCount: counters.sent ? { increment: counters.sent } : undefined,
      skippedCount: counters.skipped ? { increment: counters.skipped } : undefined,
      failedCount: counters.failed ? { increment: counters.failed } : undefined,
      queuedCount: counters.queued ? { increment: counters.queued } : undefined,
    },
  });
}

/**
 * Sends a campaign. WhatsApp campaigns go out as approved templates through the
 * WhatsApp Cloud adapter; other channels keep the BotPress delivery path.
 * Respects opt-in / marketing flags, quiet hours, and the per-minute rate limit.
 */
export async function sendCampaignNow(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error("Campaign not found.");
  if (campaign.status === CampaignStatus.PAUSED) {
    return { deferred: true, reason: "paused" as const };
  }

  if (
    isWithinQuietHours(
      campaign.quietHoursStart,
      campaign.quietHoursEnd,
      campaign.timezone,
    )
  ) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: CampaignStatus.SCHEDULED },
    });
    return { deferred: true, reason: "quiet_hours" as const };
  }

  const isWhatsApp = campaign.channel === Channel.WHATSAPP;
  let template: Awaited<ReturnType<typeof getApprovedTemplate>> | null = null;
  if (isWhatsApp) {
    if (!campaign.templateName) {
      throw new Error("WhatsApp campaigns require an approved template.");
    }
    template = await getApprovedTemplate(
      campaign.templateName,
      campaign.templateLanguage,
    );
  }

  const account = isWhatsApp
    ? await getWhatsAppAccountForOrg(campaign.organizationId)
    : null;
  const adapter = isWhatsApp
    ? account
      ? adapterFromAccount(account)
      : getChannelAdapter(ChannelType.WHATSAPP_CLOUD)
    : null;
  const templateVariables = template
    ? extractTemplateVariables(template.components)
    : [];

  const rules = campaign.targetRules as CampaignTargetRules;
  const contacts = await prisma.contact.findMany({
    where: buildContactWhereFromRules(rules, campaign.organizationId),
    take: 5000,
  });

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: CampaignStatus.RUNNING },
  });

  let sentCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const delayMs =
    campaign.rateLimitPerMinute > 0
      ? Math.ceil(60000 / campaign.rateLimitPerMinute)
      : 0;

  for (const contact of contacts) {
    const skipReason = skipReasonForContact(campaign, contact);
    if (skipReason) {
      skippedCount += 1;
      await upsertRecipient(campaignId, contact.id, {
        status: "skipped",
        skipReason,
      });
      continue;
    }

    try {
      if (isWhatsApp && adapter && template) {
        // Fill template placeholders with a best-effort value (contact name).
        const variables = templateVariables.map(
          () => contact.name ?? contact.phone ?? "",
        );
        const result = await adapter.sendMessage({
          to: contact.phone as string,
          type: MessageType.TEXT,
          template: {
            name: template.name,
            language: template.language,
            variables,
          },
          metadata: { campaignId },
        });

        if (result.skipped) {
          await upsertRecipient(campaignId, contact.id, { status: "queued" });
          continue;
        }
        if (!result.ok) {
          failedCount += 1;
          await upsertRecipient(campaignId, contact.id, {
            status: "failed",
            failedReason: result.error ?? "send_failed",
          });
          continue;
        }

        await recordMessage({
          contactId: contact.id,
          content: campaign.message,
          sender: MessageSender.AGENT,
          type: MessageType.TEXT,
          organizationId: campaign.organizationId,
          channelAccountId: account?.id ?? null,
          externalId: result.externalId ?? null,
          metadata: {
            campaignId,
            template: template.name,
          } as Prisma.InputJsonObject,
        });
        sentCount += 1;
        await upsertRecipient(campaignId, contact.id, {
          status: "sent",
          sentAt: new Date(),
          externalId: result.externalId ?? null,
        });
      } else {
        await sendBotPressMessage({
          userId: contact.botpressUserId as string,
          conversationId: contact.botpressConvId as string,
          type: "text",
          text: campaign.message,
          payload: { text: campaign.message, campaignId },
        });
        sentCount += 1;
        await upsertRecipient(campaignId, contact.id, {
          status: "sent",
          sentAt: new Date(),
        });
      }
    } catch (error) {
      failedCount += 1;
      await upsertRecipient(campaignId, contact.id, {
        status: "failed",
        failedReason: error instanceof Error ? error.message : "send_error",
      });
    }

    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  await bumpCampaignCounters(campaignId, {
    sent: sentCount,
    skipped: skippedCount,
    failed: failedCount,
  });
  const updated = await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: CampaignStatus.COMPLETED },
  });

  await emitRealtime({ type: "campaign.updated", payload: updated });

  return {
    campaign: updated,
    targetedCount: contacts.length,
    sentCount,
    skippedCount,
    failedCount,
  };
}

async function upsertRecipient(
  campaignId: string,
  contactId: string,
  data: {
    status: string;
    skipReason?: string;
    failedReason?: string;
    externalId?: string | null;
    sentAt?: Date;
  },
) {
  await prisma.campaignRecipient.upsert({
    where: { campaignId_contactId: { campaignId, contactId } },
    create: { campaignId, contactId, ...data },
    update: data,
  });
}
