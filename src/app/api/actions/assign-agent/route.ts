import { created, handleRouteError, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { findContactForAction } from "@/services/action-service";
import { ensureConversationForContact } from "@/services/conversation-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await readJson<Record<string, string>>(request);
    const contact = await findContactForAction(body);
    if (!contact) throw new Error("Contact not found for assignment.");

    const agent = await prisma.user.findUnique({
      where: { id: body.agentId },
    });
    if (!agent) throw new Error("Agent not found.");

    const conversation = await ensureConversationForContact(contact.id);
    const updated = await prisma.conversation.update({
      where: { id: conversation.id },
      data: { assignedAgentId: agent.id },
      include: { contact: true, assignedAgent: true },
    });

    await prisma.contact.update({
      where: { id: contact.id },
      data: { assignedAgentId: agent.id },
    });

    await prisma.notification.create({
      data: {
        userId: agent.id,
        type: "MESSAGE_ASSIGNED",
        title: "AI assigned a conversation",
        body: `${contact.name ?? "A contact"} was routed by BotPress intent.`,
        metadata: { contactId: contact.id, conversationId: updated.id },
      },
    });

    return created(updated);
  } catch (error) {
    return handleRouteError(error);
  }
}
