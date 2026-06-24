import { Channel, ChannelType, Prisma } from "@prisma/client";
import { apiError } from "@/lib/api";
import { adapterFromAccount, getChannelAdapter } from "@/lib/channels/registry";
import type { ChannelAdapter } from "@/lib/channels/types";
import { log, recordAudit } from "@/lib/logger";
import { resolveOrganizationId } from "@/lib/org";
import {
  applyMessageStatus,
  ingestInboundMessage,
} from "@/services/channel-ingest-service";
import {
  extractWhatsAppPhoneNumberId,
  findWhatsAppAccountByPhoneNumberId,
  recordWebhookEvent,
  touchChannelAccountWebhook,
} from "@/services/channel-account-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * WhatsApp Cloud webhook verification (GET hub-challenge handshake).
 */
export async function GET(request: Request) {
  const adapter = getChannelAdapter(ChannelType.WHATSAPP_CLOUD);
  const result = await adapter.verifyWebhook({
    method: "GET",
    url: request.url,
    headers: request.headers,
    rawBody: "",
  });

  if (result.ok) {
    return new Response(result.challenge ?? "", { status: 200 });
  }
  return apiError(`WhatsApp webhook verification failed: ${result.reason}`, 403);
}

/**
 * WhatsApp Cloud inbound webhook: stores the raw payload, verifies the
 * signature, then normalizes and ingests messages and status updates.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  let payload: Record<string, unknown>;
  try {
    payload = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
  } catch {
    return apiError("Webhook body must be valid JSON.", 400);
  }

  const phoneNumberId = extractWhatsAppPhoneNumberId(payload);
  const account = await findWhatsAppAccountByPhoneNumberId(phoneNumberId);

  // Bind the adapter to the tenant account when we recognise the phone number,
  // otherwise fall back to env-configured credentials (single-tenant setups).
  const adapter: ChannelAdapter = account
    ? adapterFromAccount(account)
    : getChannelAdapter(ChannelType.WHATSAPP_CLOUD);

  const verification = await adapter.verifyWebhook({
    method: "POST",
    url: request.url,
    headers: request.headers,
    rawBody,
  });

  // Always store the raw event (idempotent on (source, externalId)).
  await recordWebhookEvent({
    source: ChannelType.WHATSAPP_CLOUD,
    organizationId: account?.organizationId ?? null,
    channelAccountId: account?.id ?? null,
    eventType: "whatsapp.webhook",
    externalId: phoneNumberId ? `${phoneNumberId}:${hashBody(rawBody)}` : null,
    payload: payload as Prisma.InputJsonValue,
    status: verification.ok ? "received" : "rejected",
    error: verification.ok ? null : verification.reason,
  });

  if (!verification.ok) {
    if (account) {
      await touchChannelAccountWebhook(account.id, false, verification.reason);
    }
    return apiError(`Invalid webhook signature: ${verification.reason}`, 401);
  }

  try {
    const organizationId = await resolveOrganizationId(account?.organizationId);
    const events = await adapter.normalizeWebhook(payload);

    let ingested = 0;
    let statuses = 0;
    for (const event of events) {
      if (event.kind === "message") {
        const result = await ingestInboundMessage({
          organizationId,
          channel: Channel.WHATSAPP,
          channelAccountId: account?.id ?? null,
          event,
        });
        if (!result.duplicate) ingested += 1;
      } else if (event.kind === "status") {
        await applyMessageStatus({ channelAccountId: account?.id ?? null, event });
        statuses += 1;
      }
    }

    if (account) {
      await touchChannelAccountWebhook(account.id, true);
    }

    recordAudit("whatsapp.inbound", null, {
      phoneNumberId,
      ingested,
      statuses,
    });

    // Meta requires a fast 200 ack.
    return new Response(JSON.stringify({ ok: true, ingested, statuses }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    log.error("whatsapp webhook ingest failed", error, { phoneNumberId });
    if (account) {
      await touchChannelAccountWebhook(
        account.id,
        false,
        error instanceof Error ? error.message : "ingest_failed",
      );
    }
    // Still ack 200 so Meta does not hammer retries; the raw event is stored.
    return new Response(JSON.stringify({ ok: false }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
}

function hashBody(body: string): string {
  let hash = 0;
  for (let i = 0; i < body.length; i += 1) {
    hash = (hash * 31 + body.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}
