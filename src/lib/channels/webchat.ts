import { Channel, ChannelType, MessageType } from "@prisma/client";
import type {
  ChannelAdapter,
  ChannelAdapterConfig,
  ChannelCapabilities,
  NormalizedChannelEvent,
  SendMessageResult,
  WebhookVerification,
  WebhookVerificationResult,
} from "./types";

/**
 * First-party website widget channel. Inbound messages arrive from our own
 * widget endpoint; outbound agent replies are delivered to the browser through
 * the platform's realtime layer (Socket.io), so `sendMessage` is a stored no-op
 * here rather than an external API call.
 */
export class WebchatAdapter implements ChannelAdapter {
  readonly type = ChannelType.WEBCHAT;

  constructor(private readonly account: ChannelAdapterConfig = {}) {}

  private get apiKey(): string | null {
    const credentials = (this.account.credentials ?? {}) as Record<string, unknown>;
    return (credentials.apiKey as string) ?? process.env.WEBCHAT_API_KEY ?? null;
  }

  getCapabilities(): ChannelCapabilities {
    return {
      serviceWindow: false,
      requiresTemplatesOutsideWindow: false,
      supportsMedia: false,
      supportsDeliveryReceipts: false,
      supportsReadReceipts: true,
      supportsTyping: true,
      contactChannel: Channel.WEB,
    };
  }

  async verifyWebhook(
    req: WebhookVerification,
  ): Promise<WebhookVerificationResult> {
    const key = this.apiKey;
    if (!key) return { ok: true, reason: "no_api_key_configured" };
    const provided =
      req.headers.get("x-webchat-key") ?? req.headers.get("authorization");
    return provided === key || provided === `Bearer ${key}`
      ? { ok: true }
      : { ok: false, reason: "bad_api_key" };
  }

  async normalizeWebhook(
    payload: Record<string, unknown>,
  ): Promise<NormalizedChannelEvent[]> {
    const sessionId = String(payload.sessionId ?? payload.visitorId ?? "");
    const text = (payload.text as string) ?? (payload.message as string) ?? null;
    if (!sessionId || !text) return [];
    return [
      {
        kind: "message",
        externalId: (payload.messageId as string) ?? null,
        channelUserId: sessionId,
        channelConversationId: sessionId,
        text,
        type: MessageType.TEXT,
        contact: {
          name: (payload.name as string) ?? null,
          phone: (payload.phone as string) ?? null,
          email: (payload.email as string) ?? null,
        },
        timestamp: new Date(),
        raw: payload,
      },
    ];
  }

  async sendMessage(): Promise<SendMessageResult> {
    // Delivery to the browser happens via realtime emit when the message is
    // recorded; nothing to call externally.
    return { ok: true, externalId: null };
  }
}
