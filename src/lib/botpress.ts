import { createHmac, timingSafeEqual } from "node:crypto";
import { Channel } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";
import type {
  BotPressOutboundMessage,
  NormalizedBotPressWebhook,
} from "../types/platform";

function normalizeChannel(value?: string | null): Channel {
  const channel = value?.toUpperCase();
  if (channel === "WHATSAPP") {
    return Channel.WHATSAPP;
  }
  if (channel === "TELEGRAM") {
    return Channel.TELEGRAM;
  }
  if (channel === "MESSENGER") {
    return Channel.MESSENGER;
  }

  return Channel.WEB;
}

function extractText(body: Record<string, unknown>) {
  const payload = (body.payload ?? {}) as Record<string, unknown>;
  if (typeof body.text === "string") return body.text;
  if (typeof payload.text === "string") return payload.text;
  if (typeof body.message === "string") return body.message;
  return "";
}

function extractContact(body: Record<string, unknown>) {
  const contact = (body.contact ?? body.user ?? {}) as Record<string, unknown>;
  return {
    name:
      typeof contact.name === "string"
        ? contact.name
        : typeof body.name === "string"
          ? body.name
          : null,
    phone:
      typeof contact.phone === "string"
        ? contact.phone
        : typeof body.phone === "string"
          ? body.phone
          : null,
    email:
      typeof contact.email === "string"
        ? contact.email
        : typeof body.email === "string"
          ? body.email
          : null,
  };
}

export class BotPressWebhookError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status = 400, details?: unknown) {
    super(message);
    this.name = "BotPressWebhookError";
    this.status = status;
    this.details = details;
  }
}

export function verifyBotPressSignature(rawBody: string, headerValue: string) {
  const signingSecret = process.env.BOTPRESS_SIGNING_SECRET;
  if (!signingSecret) return false;
  const provided = headerValue.startsWith("sha256=")
    ? headerValue.slice("sha256=".length)
    : headerValue;
  const expected = createHmac("sha256", signingSecret)
    .update(rawBody, "utf8")
    .digest("hex");
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function verifyBotPressRequest(request: Request, rawBody?: string) {
  const signatureHeader =
    request.headers.get("x-botpress-signature") ??
    request.headers.get("x-signature");
  if (signatureHeader && process.env.BOTPRESS_SIGNING_SECRET && rawBody) {
    return verifyBotPressSignature(rawBody, signatureHeader);
  }

  const secret = process.env.BOTPRESS_WEBHOOK_SECRET;
  if (!secret) return true;

  const headerSecret =
    request.headers.get("x-botpress-secret") ??
    request.headers.get("x-webhook-secret");
  const authorization = request.headers.get("authorization");

  return headerSecret === secret || authorization === `Bearer ${secret}`;
}

export function normalizeBotPressWebhook(
  body: Record<string, unknown>,
): NormalizedBotPressWebhook {
  const event = String(body.event ?? body.type ?? "message.received").toLowerCase();
  const payload = (body.payload ?? {}) as Record<string, unknown>;
  const metadata = (body.metadata ?? {}) as Record<string, unknown>;
  const userId = String(body.userId ?? payload.userId ?? body.user_id ?? "");
  const conversationId = String(
    body.conversationId ??
      payload.conversationId ??
      body.conversation_id ??
      payload.conversation_id ??
      "",
  );

  if (!userId && !conversationId) {
    throw new BotPressWebhookError(
      "BotPress webhook requires userId or conversationId.",
      422,
      { event, hint: "Set userId and conversationId in the BotPress action body." },
    );
  }

  return {
    event,
    userId,
    conversationId,
    messageId:
      typeof body.messageId === "string"
        ? body.messageId
        : typeof payload.messageId === "string"
          ? payload.messageId
          : typeof body.message_id === "string"
            ? body.message_id
            : undefined,
    text: extractText(body),
    channel: normalizeChannel(String(body.channel ?? payload.channel ?? "web")),
    payload,
    metadata,
    raw: body,
    contact: extractContact(body),
  };
}

export async function sendBotPressMessage(
  input: Omit<BotPressOutboundMessage, "messageId"> & { messageId?: string },
) {
  const outgoingWebhookUrl = process.env.BOTPRESS_OUTGOING_WEBHOOK_URL;
  const token = process.env.BOTPRESS_API_TOKEN;
  const workspaceId = process.env.BOTPRESS_WORKSPACE_ID;
  const botId = process.env.BOTPRESS_BOT_ID;

  const body: BotPressOutboundMessage = {
    userId: input.userId,
    conversationId: input.conversationId,
    messageId: input.messageId ?? uuidv4(),
    type: input.type,
    text: input.text,
    payload: input.payload ?? (input.text ? { text: input.text } : {}),
  };

  if (!outgoingWebhookUrl && !token) {
    return {
      ok: false,
      skipped: true,
      reason:
        "No BOTPRESS_OUTGOING_WEBHOOK_URL or BOTPRESS_API_TOKEN configured.",
      body,
    };
  }

  const endpoint =
    outgoingWebhookUrl ??
    `https://api.botpress.cloud/v1/chat/messages`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(workspaceId ? { "x-workspace-id": workspaceId } : {}),
      ...(botId ? { "x-bot-id": botId } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`BotPress send failed: ${response.status} ${text}`);
  }

  return { ok: true, body };
}

export function buildBotControlPayload(action: "pause" | "resume") {
  return {
    type: "event" as const,
    payload: {
      action: action === "pause" ? "human_handoff.pause" : "bot.resume",
    },
  };
}
