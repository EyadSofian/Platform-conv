import { Channel, ChannelType, Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { log, recordAudit } from "../logger";
import { resolveOrganizationId } from "../org";
import {
  applyMessageStatus,
  ingestInboundMessage,
} from "../../services/channel-ingest-service";
import {
  recordWebhookEvent,
  touchChannelAccountWebhook,
} from "../../services/channel-account-service";
import { adapterFromAccount, getChannelAdapter } from "./registry";
import type { ChannelAdapter } from "./types";

const CONTACT_CHANNEL: Partial<Record<ChannelType, Channel>> = {
  TELEGRAM: Channel.TELEGRAM,
  FACEBOOK_MESSENGER: Channel.MESSENGER,
  INSTAGRAM: Channel.INSTAGRAM,
  WEBCHAT: Channel.WEB,
  WHATSAPP_CLOUD: Channel.WHATSAPP,
};

/** GET handshake verification for channels that use hub-challenge. */
export async function handleWebhookVerification(
  type: ChannelType,
  request: Request,
): Promise<Response> {
  const adapter = getChannelAdapter(type);
  const result = await adapter.verifyWebhook({
    method: "GET",
    url: request.url,
    headers: request.headers,
    rawBody: "",
  });
  if (result.ok) {
    return new Response(result.challenge ?? "", { status: 200 });
  }
  return new Response(
    JSON.stringify({ error: `Verification failed: ${result.reason}` }),
    { status: 403, headers: { "content-type": "application/json" } },
  );
}

/**
 * Generic inbound webhook ingest for any channel adapter: stores the raw event,
 * verifies the signature, then normalizes and ingests messages and status
 * updates. Always returns 200 quickly so providers do not aggressively retry.
 */
export async function handleWebhookIngest(
  type: ChannelType,
  request: Request,
): Promise<Response> {
  const rawBody = await request.text();
  let payload: Record<string, unknown>;
  try {
    payload = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
  } catch {
    return jsonResponse({ error: "Invalid JSON." }, 400);
  }

  // Bind to the first configured account of this type (single-app webhooks),
  // falling back to env-configured credentials.
  const account = await prisma.channelAccount.findFirst({
    where: { type },
    orderBy: { createdAt: "asc" },
  });
  const adapter: ChannelAdapter = account
    ? adapterFromAccount(account)
    : getChannelAdapter(type);

  const verification = await adapter.verifyWebhook({
    method: "POST",
    url: request.url,
    headers: request.headers,
    rawBody,
  });

  await recordWebhookEvent({
    source: type,
    organizationId: account?.organizationId ?? null,
    channelAccountId: account?.id ?? null,
    eventType: `${type.toLowerCase()}.webhook`,
    externalId: null,
    payload: payload as Prisma.InputJsonValue,
    status: verification.ok ? "received" : "rejected",
    error: verification.ok ? null : verification.reason,
  });

  if (!verification.ok) {
    if (account) await touchChannelAccountWebhook(account.id, false, verification.reason);
    return jsonResponse({ error: `Invalid signature: ${verification.reason}` }, 401);
  }

  try {
    const organizationId = await resolveOrganizationId(account?.organizationId);
    const channel = CONTACT_CHANNEL[type] ?? Channel.WEB;
    const events = await adapter.normalizeWebhook(payload);

    let ingested = 0;
    let statuses = 0;
    for (const event of events) {
      if (event.kind === "message") {
        const result = await ingestInboundMessage({
          organizationId,
          channel,
          channelAccountId: account?.id ?? null,
          event,
        });
        if (!result.duplicate) ingested += 1;
      } else {
        await applyMessageStatus({ channelAccountId: account?.id ?? null, event });
        statuses += 1;
      }
    }

    if (account) await touchChannelAccountWebhook(account.id, true);
    recordAudit("whatsapp.inbound", null, { type, ingested, statuses });
    return jsonResponse({ ok: true, ingested, statuses }, 200);
  } catch (error) {
    log.error("channel webhook ingest failed", error, { type });
    if (account) {
      await touchChannelAccountWebhook(
        account.id,
        false,
        error instanceof Error ? error.message : "ingest_failed",
      );
    }
    return jsonResponse({ ok: false }, 200);
  }
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
