import {
  Channel,
  MessageSender,
  MessageStatus,
  Prisma,
} from "@prisma/client";
import { prisma } from "../lib/prisma";
import { emitRealtime } from "../lib/realtime";
import { runAutomations } from "./automation-service";
import { dispatchIntegrationEvent } from "./integration-service";
import { recordMessage } from "./conversation-service";
import type {
  NormalizedMessageEvent,
  NormalizedStatusEvent,
} from "../lib/channels/types";

/**
 * Finds or creates a contact for an inbound channel message, deduplicating by
 * phone (and channel-native id stored in metadata) within the organization.
 */
async function resolveContact(
  organizationId: string,
  channel: Channel,
  event: NormalizedMessageEvent,
) {
  const phone = event.contact.phone ?? null;

  const existing = await prisma.contact.findFirst({
    where: {
      organizationId,
      OR: [
        ...(phone ? [{ phone }] : []),
        ...(event.contact.email ? [{ email: event.contact.email }] : []),
      ],
    },
  });

  if (existing) {
    // Backfill identity fields we may not have had before.
    if (!existing.name && event.contact.name) {
      return prisma.contact.update({
        where: { id: existing.id },
        data: { name: event.contact.name },
      });
    }
    return existing;
  }

  return prisma.contact.create({
    data: {
      organizationId,
      channel,
      name: event.contact.name ?? null,
      phone,
      email: event.contact.email ?? null,
      metadata: {
        channelUserId: event.channelUserId,
        channelConversationId: event.channelConversationId ?? null,
      } as Prisma.InputJsonObject,
    },
  });
}

/**
 * Ingests a normalized inbound message from any channel adapter. Idempotent on
 * the provider message id so retried webhooks do not duplicate messages.
 */
export async function ingestInboundMessage(params: {
  organizationId: string;
  channel: Channel;
  channelAccountId?: string | null;
  event: NormalizedMessageEvent;
}) {
  const { organizationId, channel, channelAccountId, event } = params;

  if (event.externalId && channelAccountId) {
    const duplicate = await prisma.message.findFirst({
      where: { channelAccountId, externalId: event.externalId },
      select: { id: true },
    });
    if (duplicate) {
      return { duplicate: true, messageId: duplicate.id };
    }
  }

  const contact = await resolveContact(organizationId, channel, event);

  // Detect whether this is the first message of a brand-new conversation so
  // automation rules can fire the NEW_CONVERSATION trigger.
  const existingConversation = await prisma.conversation.findUnique({
    where: { contactId: contact.id },
    select: { id: true },
  });
  const isNewConversation = !existingConversation;

  const content =
    event.text ??
    (event.media ? `[${event.media.kind}]${event.media.caption ? ` ${event.media.caption}` : ""}` : "");

  const { message, conversation } = await recordMessage({
    contactId: contact.id,
    content: content || "[message]",
    sender: MessageSender.CUSTOMER,
    type: event.type,
    organizationId,
    channelAccountId: channelAccountId ?? null,
    externalId: event.externalId ?? null,
    metadata: { channelRaw: event.raw } as Prisma.InputJsonObject,
  });

  if (conversation.assignedAgentId) {
    await prisma.notification.create({
      data: {
        userId: conversation.assignedAgentId,
        type: "CUSTOMER_REPLIED",
        title: "Customer replied",
        body: `${contact.name ?? "A customer"} sent a new message.`,
        metadata: {
          contactId: contact.id,
          conversationId: conversation.id,
          messageId: message.id,
        },
      },
    });
  }

  await trackCampaignReply(contact.id);

  // Run automation rules (NEW_CONVERSATION first, then per-message triggers).
  if (isNewConversation) {
    await runAutomations({
      organizationId,
      event: "new_conversation",
      contact,
      conversation,
      message,
    });
  }
  await runAutomations({
    organizationId,
    event: "new_message",
    contact,
    conversation,
    message,
  });

  // Fan out to subscribed integrations (Zapier/webhooks/CRMs).
  await dispatchIntegrationEvent(organizationId, "message.received", {
    contactId: contact.id,
    conversationId: conversation.id,
    channel,
    text: message.content,
  });

  return { duplicate: false, contact, message, conversation };
}

const STATUS_MAP: Record<NormalizedStatusEvent["status"], MessageStatus> = {
  sent: MessageStatus.SENT,
  delivered: MessageStatus.DELIVERED,
  read: MessageStatus.READ,
  failed: MessageStatus.FAILED,
};

/**
 * Applies a delivery/read/failed status update to a previously sent message,
 * matched by the provider message id.
 */
export async function applyMessageStatus(params: {
  channelAccountId?: string | null;
  event: NormalizedStatusEvent;
}) {
  const { channelAccountId, event } = params;
  const message = await prisma.message.findFirst({
    where: {
      externalId: event.externalId,
      ...(channelAccountId ? { channelAccountId } : {}),
    },
    select: { id: true, contactId: true },
  });
  if (!message) return { matched: false };

  const status = STATUS_MAP[event.status];
  const updated = await prisma.message.update({
    where: { id: message.id },
    data: {
      status,
      deliveredAt:
        event.status === "delivered" || event.status === "read"
          ? (event.timestamp ?? new Date())
          : undefined,
      readAt: event.status === "read" ? (event.timestamp ?? new Date()) : undefined,
      failedReason: event.status === "failed" ? event.errorReason : undefined,
    },
  });

  await emitRealtime({
    type: "message.created",
    room: `conversation:${message.contactId}`,
    payload: { id: updated.id, status: updated.status, _statusUpdate: true },
  });

  // Mirror the status onto a matching campaign recipient + campaign counters.
  await applyCampaignRecipientStatus(event);

  return { matched: true, messageId: updated.id, status };
}

/**
 * When a contact replies, mark their most recent un-replied campaign send as
 * replied and bump the campaign's reply counter (attribution heuristic).
 */
async function trackCampaignReply(contactId: string) {
  const recipient = await prisma.campaignRecipient.findFirst({
    where: {
      contactId,
      repliedAt: null,
      status: { in: ["sent", "delivered", "read"] },
    },
    orderBy: { sentAt: "desc" },
    select: { id: true, campaignId: true },
  });
  if (!recipient) return;

  await prisma.campaignRecipient.update({
    where: { id: recipient.id },
    data: { repliedAt: new Date() },
  });
  await prisma.campaign.update({
    where: { id: recipient.campaignId },
    data: { repliedCount: { increment: 1 } },
  });
}

async function applyCampaignRecipientStatus(event: NormalizedStatusEvent) {
  const recipient = await prisma.campaignRecipient.findFirst({
    where: { externalId: event.externalId },
    select: { id: true, campaignId: true, status: true },
  });
  if (!recipient) return;

  const now = event.timestamp ?? new Date();
  if (event.status === "delivered" && recipient.status !== "read") {
    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: { status: "delivered", deliveredAt: now },
    });
    await prisma.campaign.update({
      where: { id: recipient.campaignId },
      data: { deliveredCount: { increment: 1 } },
    });
  } else if (event.status === "read") {
    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: { status: "read", readAt: now },
    });
    await prisma.campaign.update({
      where: { id: recipient.campaignId },
      data: { readCount: { increment: 1 } },
    });
  } else if (event.status === "failed") {
    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: { status: "failed", failedReason: event.errorReason ?? "failed" },
    });
    await prisma.campaign.update({
      where: { id: recipient.campaignId },
      data: { failedCount: { increment: 1 } },
    });
  }
}
