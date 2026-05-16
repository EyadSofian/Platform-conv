import { created, handleRouteError, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { findContactForAction } from "@/services/action-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await readJson<Record<string, unknown>>(request);
    const contact = await findContactForAction({
      contactId: body.contactId as string | undefined,
      botpressUserId: body.botpressUserId as string | undefined,
      botpressConvId: body.botpressConvId as string | undefined,
    });

    if (!contact) throw new Error("Contact not found.");
    if (!body.userId) throw new Error("userId is required.");
    if (!body.dueAt) throw new Error("dueAt is required.");

    const reminder = await prisma.followUpReminder.create({
      data: {
        contactId: contact.id,
        userId: String(body.userId),
        dueAt: new Date(String(body.dueAt)),
        note: String(body.note ?? "Follow up with lead."),
      },
    });

    return created(reminder);
  } catch (error) {
    return handleRouteError(error);
  }
}
