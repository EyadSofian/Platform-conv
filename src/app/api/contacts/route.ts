import { Channel, ContactStatus, Prisma } from "@prisma/client";
import { created, handleRouteError, ok, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { contactCreateSchema } from "@/lib/validators";
import { ensureConversationForContact } from "@/services/conversation-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const status = params.get("status");
    const agentId = params.get("agentId");
    const tag = params.get("tag");
    const channel = params.get("channel");
    const q = params.get("q");

    const contacts = await prisma.contact.findMany({
      where: {
        status: status ? (status.toUpperCase() as ContactStatus) : undefined,
        assignedAgentId: agentId ?? undefined,
        channel: channel ? (channel.toUpperCase() as Channel) : undefined,
        tags: tag ? { has: tag } : undefined,
        OR: q
          ? [
              { name: { contains: q, mode: "insensitive" } },
              { phone: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ]
          : undefined,
      },
      include: {
        assignedAgent: {
          select: { id: true, name: true, email: true, availability: true },
        },
        conversation: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });

    return ok(contacts);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = contactCreateSchema.parse(await readJson(request));
    const contact = await prisma.contact.create({
      data: {
        ...input,
        whatsappOptInAt: input.whatsappOptInAt
          ? new Date(input.whatsappOptInAt)
          : undefined,
        metadata: input.metadata as Prisma.InputJsonObject | undefined,
      },
    });
    const conversation = await ensureConversationForContact(contact.id);

    return created({ contact, conversation });
  } catch (error) {
    return handleRouteError(error);
  }
}
