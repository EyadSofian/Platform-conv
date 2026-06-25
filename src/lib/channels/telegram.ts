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

/**
 * Telegram Bot API adapter. Inbound updates arrive via setWebhook; outbound
 * messages use the bot `sendMessage` method.
 */
export class TelegramAdapter implements ChannelAdapter {
  readonly type = ChannelType.TELEGRAM;

  constructor(private readonly account: ChannelAdapterConfig = {}) {}

  private get botToken(): string | null {
    const credentials = (this.account.credentials ?? {}) as Record<string, unknown>;
    return (
      (credentials.botToken as string) ?? process.env.TELEGRAM_BOT_TOKEN ?? null
    );
  }

  private get secretToken(): string | null {
    return (
      this.account.webhookVerifyToken ??
      process.env.TELEGRAM_WEBHOOK_SECRET ??
      null
    );
  }

  getCapabilities(): ChannelCapabilities {
    return {
      serviceWindow: false,
      requiresTemplatesOutsideWindow: false,
      supportsMedia: true,
      supportsDeliveryReceipts: false,
      supportsReadReceipts: false,
      supportsTyping: true,
      contactChannel: Channel.TELEGRAM,
    };
  }

  async verifyWebhook(
    req: WebhookVerification,
  ): Promise<WebhookVerificationResult> {
    const secret = this.secretToken;
    if (!secret) return { ok: true, reason: "no_secret_configured" };
    const provided = req.headers.get("x-telegram-bot-api-secret-token");
    return provided === secret
      ? { ok: true }
      : { ok: false, reason: "bad_secret" };
  }

  async normalizeWebhook(
    payload: Record<string, unknown>,
  ): Promise<NormalizedChannelEvent[]> {
    const message = (payload.message ?? payload.edited_message) as
      | Record<string, unknown>
      | undefined;
    if (!message) return [];

    const chat = (message.chat ?? {}) as Record<string, unknown>;
    const from = (message.from ?? {}) as Record<string, unknown>;
    const chatId = String(chat.id ?? from.id ?? "");
    if (!chatId) return [];

    const name =
      [from.first_name, from.last_name].filter(Boolean).join(" ") ||
      (chat.title as string) ||
      (from.username as string) ||
      null;

    return [
      {
        kind: "message",
        externalId: message.message_id ? String(message.message_id) : null,
        channelUserId: chatId,
        channelConversationId: chatId,
        text: (message.text as string) ?? (message.caption as string) ?? null,
        type: message.photo ? MessageType.IMAGE : MessageType.TEXT,
        contact: {
          name,
          phone: (message.contact as Record<string, unknown>)?.phone_number
            ? String((message.contact as Record<string, unknown>).phone_number)
            : null,
          email: null,
        },
        timestamp: message.date ? new Date(Number(message.date) * 1000) : null,
        raw: message,
      },
    ];
  }

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    const token = this.botToken;
    if (!token) {
      return {
        ok: false,
        skipped: true,
        error: "Telegram bot token is not configured.",
      };
    }
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: input.to, text: input.text ?? "" }),
        },
      );
      const json = (await response.json()) as {
        ok: boolean;
        result?: { message_id: number };
        description?: string;
      };
      if (!response.ok || !json.ok) {
        return { ok: false, error: json.description ?? "Telegram send failed.", raw: json };
      }
      return {
        ok: true,
        externalId: json.result ? String(json.result.message_id) : null,
        raw: json,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Telegram send failed.",
      };
    }
  }
}
