import { Prisma } from "@prisma/client";
import { handleRouteError, ok, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { findContactForAction } from "@/services/action-service";
import { contactUpdateSchema } from "@/lib/validators";

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

    const input = contactUpdateSchema.parse(body);
    const updated = await prisma.contact.update({
      where: { id: contact.id },
      data: {
        ...input,
        whatsappOptInAt: input.whatsappOptInAt
          ? new Date(input.whatsappOptInAt)
          : input.whatsappOptInAt,
        metadata: input.metadata as Prisma.InputJsonObject | undefined,
      },
    });

    return ok(updated);
  } catch (error) {
    return handleRouteError(error);
  }
}
