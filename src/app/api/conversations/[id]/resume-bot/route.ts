import { ConversationStatus } from "@prisma/client";
import { apiError, handleRouteError, ok } from "@/lib/api";
import { buildBotControlPayload, sendBotPressMessage } from "@/lib/botpress";
import { recordAudit } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { emitRealtime } from "@/lib/realtime";

export const runtime = "nodejs";

export async function PATCH(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const conversation = await prisma.conversation.update({
      where: { id: params.id },
      data: { status: ConversationStatus.BOT, unreadCount: 0 },
      include: {
        contact: true,
        assignedAgent: {
          select: { id: true, name: true, email: true, availability: true },
        },
      },
    });

    if (conversation.contact.botpressUserId && conversation.contact.botpressConvId) {
      const control = buildBotControlPayload("resume");
      await sendBotPressMessage({
        userId: conversation.contact.botpressUserId,
        conversationId: conversation.contact.botpressConvId,
        ...control,
      }).catch(() => null);
    }

    await emitRealtime({
      type: "conversation.updated",
      room: `conversation:${conversation.id}`,
      payload: conversation,
    });

    recordAudit("conversation.resume", null, {
      conversationId: conversation.id,
    });

    return ok(conversation);
  } catch (error) {
    if (error instanceof Error && error.message.includes("Record to update")) {
      return apiError("Conversation not found.", 404);
    }
    return handleRouteError(error);
  }
}
