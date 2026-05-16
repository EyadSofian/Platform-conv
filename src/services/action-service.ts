import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

export async function findContactForAction(input: {
  contactId?: string;
  botpressUserId?: string;
  botpressConvId?: string;
}) {
  if (input.contactId) {
    return prisma.contact.findUnique({ where: { id: input.contactId } });
  }

  if (!input.botpressUserId && !input.botpressConvId) return null;

  return prisma.contact.findFirst({
    where: {
      OR: [
        ...(input.botpressUserId
          ? [{ botpressUserId: input.botpressUserId }]
          : []),
        ...(input.botpressConvId ? [{ botpressConvId: input.botpressConvId }] : []),
      ],
    },
  });
}

export function mergeTags(existing: string[], next: string[]) {
  return Array.from(new Set([...existing, ...next].filter(Boolean)));
}

export function jsonObject(value?: Record<string, unknown>) {
  return value as Prisma.InputJsonObject | undefined;
}
