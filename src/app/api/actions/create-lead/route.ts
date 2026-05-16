import { Channel, ContactStatus, Prisma } from "@prisma/client";
import { created, handleRouteError, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { syncLeadToOdoo } from "@/services/odoo-service";
import { ensureConversationForContact } from "@/services/conversation-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await readJson<Record<string, unknown>>(request);
    const botpressUserId = body.botpressUserId as string | undefined;
    const botpressConvId = body.botpressConvId as string | undefined;

    const existing = botpressUserId
      ? await prisma.contact.findUnique({ where: { botpressUserId } })
      : botpressConvId
        ? await prisma.contact.findUnique({ where: { botpressConvId } })
        : null;

    const data = {
      name: body.name as string | undefined,
      email: body.email as string | undefined,
      phone: body.phone as string | undefined,
      channel: String(body.channel ?? "web").toUpperCase() as Channel,
      status: String(body.status ?? "active").toUpperCase() as ContactStatus,
      botpressUserId,
      botpressConvId,
      tags: Array.isArray(body.tags) ? (body.tags as string[]) : ["lead"],
      whatsappOptIn: Boolean(body.whatsappOptIn),
      whatsappOptInAt: body.whatsappOptIn ? new Date() : undefined,
      whatsappOptInSource: body.whatsappOptIn ? "botpress_action" : undefined,
      metadata: (body.metadata ?? {}) as Prisma.InputJsonObject,
    };

    const contact = existing
      ? await prisma.contact.update({ where: { id: existing.id }, data })
      : await prisma.contact.create({ data });
    const conversation = await ensureConversationForContact(contact.id);

    if (process.env.ODOO_SYNC_ENABLED === "true") {
      await syncLeadToOdoo(
        contact.id,
        "Lead created automatically from BotPress AI action.",
      ).catch(() => null);
    }

    return created({ contact, conversation });
  } catch (error) {
    return handleRouteError(error);
  }
}
