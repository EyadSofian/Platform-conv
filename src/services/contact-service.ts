import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

type ContactIdentity = {
  organizationId?: string | null;
  phone?: string | null;
  email?: string | null;
  botpressUserId?: string | null;
};

/**
 * Finds an existing contact that matches the given identity, deduplicating by
 * BotPress id, phone, then email — scoped to the organization when provided.
 */
export async function findDuplicateContact(identity: ContactIdentity) {
  const { organizationId, phone, email, botpressUserId } = identity;
  if (!phone && !email && !botpressUserId) return null;

  return prisma.contact.findFirst({
    where: {
      ...(organizationId ? { organizationId } : {}),
      OR: [
        ...(botpressUserId ? [{ botpressUserId }] : []),
        ...(phone ? [{ phone }] : []),
        ...(email ? [{ email }] : []),
      ],
    },
  });
}

function normalizeDates(input: Record<string, unknown>) {
  const data = { ...input };
  if (typeof data.whatsappOptInAt === "string") {
    data.whatsappOptInAt = new Date(data.whatsappOptInAt);
  }
  return data;
}

/**
 * Creates a contact or updates the matching duplicate. Returns the contact and
 * whether it was newly created so callers can decide on conversation setup.
 */
export async function upsertContact(
  organizationId: string,
  input: Record<string, unknown>,
): Promise<{ created: boolean; contact: Awaited<ReturnType<typeof prisma.contact.create>> }> {
  const existing = await findDuplicateContact({
    organizationId,
    phone: (input.phone as string) ?? null,
    email: (input.email as string) ?? null,
    botpressUserId: (input.botpressUserId as string) ?? null,
  });

  const data = normalizeDates(input);

  if (existing) {
    const contact = await prisma.contact.update({
      where: { id: existing.id },
      data: {
        ...data,
        organizationId,
        metadata: data.metadata as Prisma.InputJsonObject | undefined,
        customFields: data.customFields as Prisma.InputJsonObject | undefined,
      },
    });
    return { created: false, contact };
  }

  const contact = await prisma.contact.create({
    data: {
      ...data,
      organizationId,
      metadata: data.metadata as Prisma.InputJsonObject | undefined,
      customFields: data.customFields as Prisma.InputJsonObject | undefined,
    } as Prisma.ContactUncheckedCreateInput,
  });
  return { created: true, contact };
}
