import { handleRouteError, ok, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { findContactForAction, mergeTags } from "@/services/action-service";

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

    const tags = Array.isArray(body.tags)
      ? (body.tags as string[])
      : typeof body.tag === "string"
        ? [body.tag]
        : [];

    if (!tags.length) throw new Error("tag or tags is required.");

    const updated = await prisma.contact.update({
      where: { id: contact.id },
      data: { tags: mergeTags(contact.tags, tags) },
    });

    return ok(updated);
  } catch (error) {
    return handleRouteError(error);
  }
}
