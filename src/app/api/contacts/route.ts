import { Channel, ContactStatus } from "@prisma/client";
import { created, handleRouteError, ok, readJson } from "@/lib/api";
import { resolveOrganizationId } from "@/lib/org";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { contactCreateSchema } from "@/lib/validators";
import { upsertContact } from "@/services/contact-service";
import { ensureConversationForContact } from "@/services/conversation-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const organizationId = await resolveOrganizationId(user.organizationId);
    const params = new URL(request.url).searchParams;
    const status = params.get("status");
    const agentId = params.get("agentId");
    const tag = params.get("tag");
    const channel = params.get("channel");
    const q = params.get("q");
    const unsubscribed = params.get("unsubscribed");

    const contacts = await prisma.contact.findMany({
      where: {
        organizationId,
        status: status ? (status.toUpperCase() as ContactStatus) : undefined,
        assignedAgentId: agentId ?? undefined,
        channel: channel ? (channel.toUpperCase() as Channel) : undefined,
        tags: tag ? { has: tag } : undefined,
        unsubscribed:
          unsubscribed === "true"
            ? true
            : unsubscribed === "false"
              ? false
              : undefined,
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
    const user = await requireUser();
    const organizationId = await resolveOrganizationId(user.organizationId);
    const input = contactCreateSchema.parse(await readJson(request));

    // Deduplicate by phone / email / BotPress id within the workspace.
    const { contact, created: isNew } = await upsertContact(
      organizationId,
      input,
    );
    const conversation = await ensureConversationForContact(contact.id);

    return created({ contact, conversation, deduplicated: !isNew });
  } catch (error) {
    return handleRouteError(error);
  }
}
