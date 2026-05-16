import { apiError, handleRouteError, ok, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { emitRealtime } from "@/lib/realtime";
import { assignConversationSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const input = assignConversationSchema.parse(await readJson(request));
    const agent = await prisma.user.findUnique({ where: { id: input.agentId } });
    if (!agent) return apiError("Agent not found.", 404);

    const conversation = await prisma.conversation.update({
      where: { id: params.id },
      data: { assignedAgentId: input.agentId },
      include: {
        contact: true,
        assignedAgent: {
          select: { id: true, name: true, email: true, availability: true },
        },
      },
    });

    await prisma.contact.update({
      where: { id: conversation.contactId },
      data: { assignedAgentId: input.agentId },
    });

    await prisma.notification.create({
      data: {
        userId: input.agentId,
        type: "MESSAGE_ASSIGNED",
        title: "Conversation assigned",
        body: `${conversation.contact.name ?? "A contact"} was assigned to you.`,
        metadata: {
          contactId: conversation.contactId,
          conversationId: conversation.id,
        },
      },
    });

    await emitRealtime({
      type: "conversation.updated",
      payload: conversation,
    });

    return ok(conversation);
  } catch (error) {
    if (error instanceof Error && error.message.includes("Record to update")) {
      return apiError("Conversation not found.", 404);
    }
    return handleRouteError(error);
  }
}
