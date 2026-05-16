import {
  CampaignStatus,
  CampaignType,
  Channel,
  ContactStatus,
  Prisma,
} from "@prisma/client";
import { sendBotPressMessage } from "../lib/botpress";
import { emitRealtime } from "../lib/realtime";
import { prisma } from "../lib/prisma";
import { assertMarketingEligible, getApprovedTemplate } from "../lib/whatsapp";

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
): Prisma.ContactWhereInput {
  return {
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

export async function sendCampaignNow(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
  });

  if (!campaign) {
    throw new Error("Campaign not found.");
  }

  const rules = campaign.targetRules as CampaignTargetRules;
  if (campaign.channel === Channel.WHATSAPP && campaign.templateName) {
    await getApprovedTemplate(campaign.templateName, campaign.templateLanguage);
  }

  const contacts = await prisma.contact.findMany({
    where: buildContactWhereFromRules(rules),
    take: 5000,
  });

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: CampaignStatus.RUNNING },
  });

  let sentCount = 0;

  for (const contact of contacts) {
    const skipReason =
      campaign.channel === Channel.WHATSAPP && campaign.respectOptIn
        ? assertMarketingEligible(contact)
        : null;

    if (skipReason) {
      await prisma.campaignRecipient.upsert({
        where: {
          campaignId_contactId: { campaignId, contactId: contact.id },
        },
        create: {
          campaignId,
          contactId: contact.id,
          status: "skipped",
          skipReason,
        },
        update: { status: "skipped", skipReason },
      });
      continue;
    }

    if (!contact.botpressUserId || !contact.botpressConvId) {
      await prisma.campaignRecipient.upsert({
        where: {
          campaignId_contactId: { campaignId, contactId: contact.id },
        },
        create: {
          campaignId,
          contactId: contact.id,
          status: "skipped_missing_botpress_link",
          skipReason: "missing_botpress_link",
        },
        update: {
          status: "skipped_missing_botpress_link",
          skipReason: "missing_botpress_link",
        },
      });
      continue;
    }

    await sendBotPressMessage({
      userId: contact.botpressUserId,
      conversationId: contact.botpressConvId,
      type: "text",
      text: campaign.message,
      payload: {
        text: campaign.message,
        campaignId,
        campaignType: campaign.type,
        channel: campaign.channel,
        templateName: campaign.templateName,
        templateLanguage: campaign.templateLanguage,
      },
    });

    sentCount += 1;
    await prisma.campaignRecipient.upsert({
      where: {
        campaignId_contactId: { campaignId, contactId: contact.id },
      },
      create: {
        campaignId,
        contactId: contact.id,
        status: "sent",
        sentAt: new Date(),
      },
      update: { status: "sent", sentAt: new Date() },
    });

    if (campaign.rateLimitPerMinute > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.ceil(60000 / campaign.rateLimitPerMinute)),
      );
    }
  }

  const updated = await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      sentCount: { increment: sentCount },
      status: CampaignStatus.COMPLETED,
    },
  });

  await emitRealtime({
    type: "campaign.updated",
    payload: updated,
  });

  return { campaign: updated, targetedCount: contacts.length, sentCount };
}
