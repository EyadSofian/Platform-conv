import { ChannelType, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

/**
 * Locates the WhatsApp channel account that owns an inbound webhook, matched by
 * the `phone_number_id` Meta includes in every change. Returns null when no
 * account is configured yet (single-tenant env fallback handles that case).
 */
export async function findWhatsAppAccountByPhoneNumberId(
  phoneNumberId: string | null | undefined,
) {
  if (!phoneNumberId) return null;
  return prisma.channelAccount.findFirst({
    where: {
      type: ChannelType.WHATSAPP_CLOUD,
      OR: [{ phoneNumberId }, { externalId: phoneNumberId }],
    },
  });
}

/** Resolves the active WhatsApp account for an org, if one is configured. */
export async function getWhatsAppAccountForOrg(
  organizationId: string | null | undefined,
) {
  return prisma.channelAccount.findFirst({
    where: {
      type: ChannelType.WHATSAPP_CLOUD,
      ...(organizationId ? { organizationId } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
}

export function extractWhatsAppPhoneNumberId(
  payload: Record<string, unknown>,
): string | null {
  const entries = (payload.entry as unknown[]) ?? [];
  for (const entry of entries) {
    const changes = ((entry as Record<string, unknown>).changes as unknown[]) ?? [];
    for (const change of changes) {
      const value = ((change as Record<string, unknown>).value ?? {}) as Record<
        string,
        unknown
      >;
      const metadata = (value.metadata ?? {}) as Record<string, unknown>;
      if (metadata.phone_number_id) return String(metadata.phone_number_id);
    }
  }
  return null;
}

/** Persists a raw inbound webhook for debugging + idempotency. */
export async function recordWebhookEvent(input: {
  source: ChannelType;
  organizationId?: string | null;
  channelAccountId?: string | null;
  eventType?: string | null;
  externalId?: string | null;
  payload: Prisma.InputJsonValue;
  status?: string;
  error?: string | null;
}) {
  try {
    return await prisma.webhookEvent.create({
      data: {
        source: input.source,
        organizationId: input.organizationId ?? null,
        channelAccountId: input.channelAccountId ?? null,
        eventType: input.eventType ?? null,
        externalId: input.externalId ?? null,
        status: input.status ?? "received",
        error: input.error ?? null,
        payload: input.payload,
      },
    });
  } catch (error) {
    // A unique-collision on (source, externalId) means we have already stored
    // this event — safe to ignore for idempotency.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return null;
    }
    throw error;
  }
}

export async function touchChannelAccountWebhook(
  channelAccountId: string,
  ok: boolean,
  errorMessage?: string,
) {
  await prisma.channelAccount.update({
    where: { id: channelAccountId },
    data: {
      lastWebhookAt: new Date(),
      ...(ok
        ? { status: "CONNECTED", lastError: null }
        : { status: "WEBHOOK_FAILING", lastError: errorMessage, lastErrorAt: new Date() }),
    },
  });
}
