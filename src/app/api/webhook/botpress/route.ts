import { MessageSender, Prisma } from "@prisma/client";
import { apiError, handleRouteError, ok } from "@/lib/api";
import {
  BotPressWebhookError,
  normalizeBotPressWebhook,
  verifyBotPressRequest,
} from "@/lib/botpress";
import { prisma } from "@/lib/prisma";
import { emitRealtime } from "@/lib/realtime";
import {
  closeBotPressConversation,
  recordMessage,
  requestHumanHandoff,
  upsertBotPressContact,
} from "@/services/conversation-service";

export const runtime = "nodejs";

const BOT_EVENTS = new Set([
  "message.sent",
  "bot.message.sent",
  "bot.reply",
  "outgoing.message",
]);

const CUSTOMER_EVENTS = new Set([
  "message.received",
  "message.created",
  "incoming.message",
]);

const HANDOFF_EVENTS = new Set([
  "handoff.requested",
  "handoff.request",
  "human.requested",
]);

const CLOSE_EVENTS = new Set([
  "conversation.closed",
  "conversation.ended",
  "session.closed",
]);

const START_EVENTS = new Set([
  "conversation.started",
  "conversation.created",
  "session.started",
]);

function buildMessageMetadata(webhook: ReturnType<typeof normalizeBotPressWebhook>) {
  return {
    botpressEvent: webhook.event,
    botpressMetadata: webhook.metadata,
    botpressRaw: webhook.raw,
  } as Prisma.InputJsonObject;
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();

    if (!verifyBotPressRequest(request, rawBody)) {
      return apiError("Invalid BotPress webhook signature or secret.", 401);
    }

    let body: Record<string, unknown>;
    try {
      body = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
    } catch (error) {
      console.error("[botpress] failed to parse webhook JSON", error);
      return apiError("Webhook body must be valid JSON.", 400);
    }

    const webhook = normalizeBotPressWebhook(body);
    const event = webhook.event;
    const contact = await upsertBotPressContact(webhook);

    if (START_EVENTS.has(event)) {
      const conversation = await prisma.conversation.findUnique({
        where: { contactId: contact.id },
        include: {
          contact: true,
          assignedAgent: {
            select: { id: true, name: true, email: true, availability: true },
          },
        },
      });

      if (conversation) {
        await emitRealtime({
          type: "conversation.updated",
          payload: conversation,
        });
      }

      return ok({ received: true, contactId: contact.id, event });
    }

    if (HANDOFF_EVENTS.has(event)) {
      const conversation = await requestHumanHandoff(contact.id);
      if (webhook.text) {
        await recordMessage({
          contactId: contact.id,
          content: webhook.text,
          sender: MessageSender.SYSTEM,
          metadata: buildMessageMetadata(webhook),
          botpressMessageId: webhook.messageId,
        });
      }

      return ok({ received: true, conversation, event });
    }

    if (CLOSE_EVENTS.has(event)) {
      const conversation = await closeBotPressConversation(contact.id);
      return ok({ received: true, conversation, event });
    }

    if (webhook.messageId) {
      const existing = await prisma.message.findUnique({
        where: { botpressMessageId: webhook.messageId },
      });
      if (existing) {
        return ok({ received: true, duplicate: true, messageId: existing.id });
      }
    }

    const sender = BOT_EVENTS.has(event)
      ? MessageSender.BOT
      : CUSTOMER_EVENTS.has(event)
        ? MessageSender.CUSTOMER
        : webhook.text
          ? MessageSender.CUSTOMER
          : MessageSender.SYSTEM;

    const content =
      webhook.text ||
      (typeof webhook.payload?.text === "string"
        ? (webhook.payload.text as string)
        : JSON.stringify(webhook.payload));

    const { message, conversation } = await recordMessage({
      contactId: contact.id,
      content,
      sender,
      botpressMessageId: webhook.messageId,
      metadata: buildMessageMetadata(webhook),
    });

    if (sender === MessageSender.CUSTOMER && conversation.assignedAgentId) {
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

    return ok({
      received: true,
      event,
      contactId: contact.id,
      messageId: message.id,
    });
  } catch (error) {
    if (error instanceof BotPressWebhookError) {
      console.warn("[botpress] webhook rejected:", error.message, error.details);
      return apiError(error.message, error.status, error.details);
    }
    console.error("[botpress] webhook handler error:", error);
    return handleRouteError(error);
  }
}
