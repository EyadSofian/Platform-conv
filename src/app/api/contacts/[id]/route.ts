import { Prisma } from "@prisma/client";
import { apiError, handleRouteError, ok, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { contactUpdateSchema } from "@/lib/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const contact = await prisma.contact.findUnique({
      where: { id: params.id },
      include: {
        assignedAgent: {
          select: { id: true, name: true, email: true, availability: true },
        },
        conversation: true,
        messages: { orderBy: { createdAt: "asc" } },
        campaignRecipients: {
          include: { campaign: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!contact) return apiError("Contact not found.", 404);
    return ok(contact);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const input = contactUpdateSchema.parse(await readJson(request));
    const contact = await prisma.contact.update({
      where: { id: params.id },
      data: {
        ...input,
        whatsappOptInAt: input.whatsappOptInAt
          ? new Date(input.whatsappOptInAt)
          : input.whatsappOptInAt,
        metadata: input.metadata as Prisma.InputJsonObject | undefined,
      },
      include: {
        assignedAgent: {
          select: { id: true, name: true, email: true, availability: true },
        },
        conversation: true,
      },
    });

    return ok(contact);
  } catch (error) {
    if (error instanceof Error && error.message.includes("Record to update")) {
      return apiError("Contact not found.", 404);
    }
    return handleRouteError(error);
  }
}
