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

/**
 * Shared adapter for Meta messaging platforms that use the Graph Send API and
 * webhook envelope: Facebook Messenger and Instagram Direct. Both deliver
 * inbound events under `entry[].messaging[]` keyed by PSID/IGSID and send via
 * `/me/messages`.
 */
export class MetaMessagingAdapter implements ChannelAdapter {
  readonly type: ChannelType;

  constructor(
    type: ChannelType,
    private readonly account: ChannelAdapterConfig = {},
  ) {
    this.type = type;
  }

  private get config() {
    return (this.account.config ?? {}) as Record<string, unknown>;
  }
  private get credentials() {
    return (this.account.credentials ?? {}) as Record<string, unknown>;
  }
  private get accessToken(): string | null {
    return (
      (this.credentials.accessToken as string) ??
      process.env.META_PAGE_ACCESS_TOKEN ??
      null
    );
  }
  private get appSecret(): string | null {
    return (
      (this.credentials.appSecret as string) ??
      process.env.META_APP_SECRET ??
      null
    );
  }
  private get verifyToken(): string | null {
    return (
      this.account.webhookVerifyToken ??
      (this.config.verifyToken as string) ??
      process.env.META_WEBHOOK_VERIFY_TOKEN ??
      null
    );
  }

  getCapabilities(): ChannelCapabilities {
    return {
      serviceWindow: true,
      serviceWindowHours: 24,
      requiresTemplatesOutsideWindow: false,
      supportsMedia: true,
      supportsDeliveryReceipts: true,
      supportsReadReceipts: true,
      supportsTyping: true,
      contactChannel:
        this.type === ChannelType.INSTAGRAM
          ? Channel.INSTAGRAM
          : Channel.MESSENGER,
    };
  }

  async verifyWebhook(
    req: WebhookVerification,
  ): Promise<WebhookVerificationResult> {
    if (req.method.toUpperCase() === "GET") {
      const url = new URL(req.url);
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge") ?? "";
      if (mode === "subscribe" && this.verifyToken && token === this.verifyToken) {
        return { ok: true, challenge };
      }
      return { ok: false, reason: "verify_token_mismatch" };
    }

    const appSecret = this.appSecret;
    if (!appSecret) return { ok: true, reason: "no_app_secret_configured" };
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
      const messaging =
        ((entry as Record<string, unknown>).messaging as unknown[]) ?? [];
      for (const item of messaging) {
        const event = item as Record<string, unknown>;
        const sender = (event.sender ?? {}) as Record<string, unknown>;
        const senderId = String(sender.id ?? "");
        if (!senderId) continue;

        const message = event.message as Record<string, unknown> | undefined;
        if (message && !message.is_echo) {
          events.push({
            kind: "message",
            externalId: (message.mid as string) ?? null,
            channelUserId: senderId,
            channelConversationId: senderId,
            text: (message.text as string) ?? null,
            type: MessageType.TEXT,
            contact: { name: null, phone: null, email: null },
            timestamp: event.timestamp
              ? new Date(Number(event.timestamp))
              : null,
            raw: event,
          });
          continue;
        }

        // Delivery / read receipts.
        const delivery = event.delivery as Record<string, unknown> | undefined;
        const read = event.read as Record<string, unknown> | undefined;
        if (delivery && Array.isArray(delivery.mids)) {
          for (const mid of delivery.mids as string[]) {
            events.push({
              kind: "status",
              externalId: String(mid),
              status: "delivered",
              channelUserId: senderId,
              timestamp: new Date(),
              raw: event,
            });
          }
        } else if (read) {
          // Meta read events are timestamp-watermarks, not per-message ids.
          events.push({
            kind: "status",
            externalId: `${senderId}:${read.watermark ?? Date.now()}`,
            status: "read",
            channelUserId: senderId,
            timestamp: new Date(),
            raw: event,
          });
        }
      }
    }
    return events;
  }

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    const token = this.accessToken;
    if (!token) {
      return {
        ok: false,
        skipped: true,
        error: `${this.type} access token is not configured.`,
      };
    }
    try {
      const response = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/me/messages?access_token=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            recipient: { id: input.to },
            messaging_type: "RESPONSE",
            message: { text: input.text ?? "" },
          }),
        },
      );
      const json = (await response.json()) as {
        message_id?: string;
        error?: { message?: string };
      };
      if (!response.ok || json.error) {
        return {
          ok: false,
          error: json.error?.message ?? `${this.type} send failed.`,
          raw: json,
        };
      }
      return { ok: true, externalId: json.message_id ?? null, raw: json };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : `${this.type} send failed.`,
      };
    }
  }
}
