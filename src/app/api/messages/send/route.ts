import {
  ConversationStatus,
  MessageSender,
  MessageType,
  Prisma,
} from "@prisma/client";
import { apiError, handleRouteError, ok, readJson } from "@/lib/api";
import { sendBotPressMessage } from "@/lib/botpress";
import { log, recordAudit } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { sendMessageSchema } from "@/lib/validators";
import { recordMessage } from "@/services/conversation-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = sendMessageSchema.parse(await readJson(request));
    const contact = await prisma.contact.findUnique({
      where: { id: input.contactId },
      include: { conversation: true },
    });

    if (!contact) {
      return apiError("Contact not found.", 404);
    }

    if (contact.conversation?.status === ConversationStatus.CLOSED) {
      return apiError("Conversation is closed. Reopen it before sending.", 409);
    }

    const { message, conversation } = await recordMessage({
      contactId: contact.id,
      content: input.content,
      sender: MessageSender.AGENT,
      senderId: input.senderId,
      type: input.type as MessageType,
      metadata: input.metadata as Prisma.InputJsonObject | undefined,
    });

    let botpressDelivery: Awaited<ReturnType<typeof sendBotPressMessage>> | null =
      null;

    if (contact.botpressUserId && contact.botpressConvId) {
      const outboundType =
        input.type === MessageType.IMAGE
          ? "image"
          : input.type === MessageType.FILE
            ? "file"
            : "text";

      try {
        botpressDelivery = await sendBotPressMessage({
          userId: contact.botpressUserId,
          conversationId: contact.botpressConvId,
          type: outboundType,
          text: input.content,
          payload: {
            text: input.content,
            mode:
              conversation.status === ConversationStatus.HUMAN ? "human" : "bot",
            agentMessageId: message.id,
            ...input.metadata,
          },
        });
      } catch (botpressError) {
        log.error("messages.send botpress delivery failed", botpressError, {
          conversationId: conversation.id,
          messageId: message.id,
        });
        throw botpressError;
      }
    }

    recordAudit("message.sent", input.senderId ?? null, {
      conversationId: conversation.id,
      messageId: message.id,
      delivered: botpressDelivery?.ok ?? false,
    });

    return ok({ message, conversation, botpressDelivery });
  } catch (error) {
    return handleRouteError(error);
  }
}
