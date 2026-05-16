import { ConversationStatus } from "@prisma/client";
import { apiError, handleRouteError, ok, readJson } from "@/lib/api";
import { buildBotControlPayload, sendBotPressMessage } from "@/lib/botpress";
import { recordAudit } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { emitRealtime } from "@/lib/realtime";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    let body: { agentId?: string } = {};
    try {
      body = await readJson<{ agentId?: string }>(request);
    } catch {
      body = {};
    }
    const conversation = await prisma.conversation.update({
      where: { id: params.id },
      data: {
        status: ConversationStatus.HUMAN,
        assignedAgentId: body.agentId,
        unreadCount: 0,
      },
      include: {
        contact: true,
        assignedAgent: {
          select: { id: true, name: true, email: true, availability: true },
        },
      },
    });

    if (body.agentId) {
      await prisma.contact.update({
        where: { id: conversation.contactId },
        data: { assignedAgentId: body.agentId },
      });
    }

    if (conversation.contact.botpressUserId && conversation.contact.botpressConvId) {
      const control = buildBotControlPayload("pause");
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

    recordAudit("conversation.takeover", body.agentId ?? null, {
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
