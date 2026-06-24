import { createHmac, timingSafeEqual } from "node:crypto";
import { Channel, ChannelType, MessageType } from "@prisma/client";
import type {
  ChannelAdapter,
  ChannelAdapterConfig,
  ChannelCapabilities,
  NormalizedChannelEvent,
  SendMessageInput,
  SendMessageResult,
  WebhookVerification,
  WebhookVerificationResult,
} from "./types";

const GRAPH_VERSION = "v23.0";

type WhatsAppRuntimeConfig = {
  phoneNumberId?: string | null;
  businessAccountId?: string | null;
  accessToken?: string | null;
  appSecret?: string | null;
  verifyToken?: string | null;
};

function mapMediaType(type: string): MessageType {
  switch (type) {
    case "image":
      return MessageType.IMAGE;
    case "document":
    case "audio":
    case "video":
      return MessageType.FILE;
    default:
      return MessageType.TEXT;
  }
}

/**
 * Direct WhatsApp Cloud API adapter. Configuration is resolved from a
 * `ChannelAccount` row when present, falling back to environment variables so
 * the platform keeps working with a single-tenant `.env` setup.
 */
export class WhatsAppCloudAdapter implements ChannelAdapter {
  readonly type = ChannelType.WHATSAPP_CLOUD;

  constructor(private readonly account: ChannelAdapterConfig = {}) {}

  private get runtime(): WhatsAppRuntimeConfig {
    const config = (this.account.config ?? {}) as Record<string, unknown>;
    const credentials = (this.account.credentials ?? {}) as Record<
      string,
      unknown
    >;
    return {
      phoneNumberId:
        (config.phoneNumberId as string) ??
        process.env.WHATSAPP_PHONE_NUMBER_ID ??
        null,
      businessAccountId:
        (config.businessAccountId as string) ??
        process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ??
        null,
      accessToken:
        (credentials.accessToken as string) ??
        process.env.WHATSAPP_ACCESS_TOKEN ??
        null,
      appSecret:
        (credentials.appSecret as string) ??
        process.env.WHATSAPP_APP_SECRET ??
        null,
      verifyToken:
        this.account.webhookVerifyToken ??
        (config.verifyToken as string) ??
        process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ??
        null,
    };
  }

  getCapabilities(): ChannelCapabilities {
    return {
      serviceWindow: true,
      serviceWindowHours: 24,
      requiresTemplatesOutsideWindow: true,
      supportsMedia: true,
      supportsDeliveryReceipts: true,
      supportsReadReceipts: true,
      supportsTyping: false,
      contactChannel: Channel.WHATSAPP,
    };
  }

  async verifyWebhook(
    req: WebhookVerification,
  ): Promise<WebhookVerificationResult> {
    // GET hub-challenge verification (Meta webhook setup).
    if (req.method.toUpperCase() === "GET") {
      const url = new URL(req.url);
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge") ?? "";
      const verifyToken = this.runtime.verifyToken;
      if (mode === "subscribe" && verifyToken && token === verifyToken) {
        return { ok: true, challenge };
      }
      return { ok: false, reason: "verify_token_mismatch" };
    }

    // POST signature verification (X-Hub-Signature-256). When no app secret is
    // configured we accept the payload but flag it so callers can warn.
    const appSecret = this.runtime.appSecret;
    if (!appSecret) {
      return { ok: true, reason: "no_app_secret_configured" };
    }
    const signature = req.headers.get("x-hub-signature-256");
    if (!signature) return { ok: false, reason: "missing_signature" };
    const expected =
      "sha256=" +
      createHmac("sha256", appSecret).update(req.rawBody, "utf8").digest("hex");
    try {
      const a = Buffer.from(signature);
      const b = Buffer.from(expected);
      if (a.length !== b.length) return { ok: false, reason: "bad_signature" };
      return timingSafeEqual(a, b)
        ? { ok: true }
        : { ok: false, reason: "bad_signature" };
    } catch {
      return { ok: false, reason: "bad_signature" };
    }
  }

  async normalizeWebhook(
    payload: Record<string, unknown>,
  ): Promise<NormalizedChannelEvent[]> {
    const events: NormalizedChannelEvent[] = [];
    const entries = (payload.entry as unknown[]) ?? [];

    for (const entry of entries) {
      const changes = ((entry as Record<string, unknown>).changes as unknown[]) ?? [];
      for (const change of changes) {
        const value = ((change as Record<string, unknown>).value ?? {}) as Record<
          string,
          unknown
        >;
        const contactsRaw = (value.contacts as unknown[]) ?? [];
        const profileByWaId = new Map<string, string | null>();
        for (const c of contactsRaw) {
          const contact = c as Record<string, unknown>;
          const waId = String(contact.wa_id ?? "");
          const profile = (contact.profile ?? {}) as Record<string, unknown>;
          if (waId) profileByWaId.set(waId, (profile.name as string) ?? null);
        }

        // Inbound messages.
        const messages = (value.messages as unknown[]) ?? [];
        for (const m of messages) {
          const message = m as Record<string, unknown>;
          const from = String(message.from ?? "");
          const type = String(message.type ?? "text");
          const text =
            type === "text"
              ? ((message.text as Record<string, unknown>)?.body as string) ?? ""
              : ((message[type] as Record<string, unknown>)?.caption as string) ??
                null;
          const mediaPayload =
            type !== "text"
              ? (message[type] as Record<string, unknown> | undefined)
              : undefined;
          events.push({
            kind: "message",
            externalId: String(message.id ?? ""),
            channelUserId: from,
            channelConversationId: from,
            text,
            type: mapMediaType(type),
            contact: {
              name: profileByWaId.get(from) ?? null,
              phone: from ? `+${from}` : null,
              email: null,
            },
            media: mediaPayload
              ? {
                  kind:
                    type === "image"
                      ? "image"
                      : type === "audio"
                        ? "audio"
                        : type === "video"
                          ? "video"
                          : "document",
                  id: (mediaPayload.id as string) ?? null,
                  url: null,
                  mimeType: (mediaPayload.mime_type as string) ?? null,
                  caption: (mediaPayload.caption as string) ?? null,
                }
              : null,
            timestamp: message.timestamp
              ? new Date(Number(message.timestamp) * 1000)
              : null,
            raw: message,
          });
        }

        // Delivery / read status updates.
        const statuses = (value.statuses as unknown[]) ?? [];
        for (const s of statuses) {
          const status = s as Record<string, unknown>;
          const statusValue = String(status.status ?? "");
          if (!["sent", "delivered", "read", "failed"].includes(statusValue)) {
            continue;
          }
          const errors = (status.errors as unknown[]) ?? [];
          const firstError = errors[0] as Record<string, unknown> | undefined;
          events.push({
            kind: "status",
            externalId: String(status.id ?? ""),
            status: statusValue as "sent" | "delivered" | "read" | "failed",
            channelUserId: status.recipient_id
              ? String(status.recipient_id)
              : null,
            errorReason: firstError
              ? String(firstError.title ?? firstError.message ?? "failed")
              : null,
            timestamp: status.timestamp
              ? new Date(Number(status.timestamp) * 1000)
              : null,
            raw: status,
          });
        }
      }
    }

    return events;
  }

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    const { phoneNumberId, accessToken } = this.runtime;
    if (!phoneNumberId || !accessToken) {
      return {
        ok: false,
        skipped: true,
        error: "WhatsApp Cloud credentials are not configured.",
      };
    }

    const to = input.to.replace(/[^\d]/g, "");
    let body: Record<string, unknown>;

    if (input.type === MessageType.TEXT && input.text) {
      body = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { body: input.text },
      };
    } else if (input.template) {
      body = {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: input.template.name,
          language: { code: input.template.language },
          ...(input.template.variables && input.template.variables.length > 0
            ? {
                components: [
                  {
                    type: "body",
                    parameters: input.template.variables.map((text) => ({
                      type: "text",
                      text,
                    })),
                  },
                ],
              }
            : {}),
        },
      };
    } else if (input.media) {
      body = {
        messaging_product: "whatsapp",
        to,
        type: input.media.kind,
        [input.media.kind]: {
          ...(input.media.id ? { id: input.media.id } : {}),
          ...(input.media.url ? { link: input.media.url } : {}),
          ...(input.media.caption ? { caption: input.media.caption } : {}),
        },
      };
    } else {
      return { ok: false, error: "Unsupported message payload." };
    }

    try {
      const response = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(body),
        },
      );
      const json = (await response.json()) as {
        messages?: { id: string }[];
        error?: { message?: string };
      };
      if (!response.ok || json.error) {
        return {
          ok: false,
          error: json.error?.message ?? `WhatsApp send failed (${response.status})`,
          raw: json,
        };
      }
      return {
        ok: true,
        externalId: json.messages?.[0]?.id ?? null,
        raw: json,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "WhatsApp send failed.",
      };
    }
  }
}
