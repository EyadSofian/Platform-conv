import { Channel, ChannelType, MessageType } from "@prisma/client";
import {
  normalizeBotPressWebhook,
  sendBotPressMessage,
  verifyBotPressSignature,
} from "../botpress";
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
 * BotPress as an optional channel adapter. This wraps the existing BotPress
 * helpers so the legacy webhook keeps working while BotPress becomes "just
 * another channel" behind the same `ChannelAdapter` contract.
 */
export class BotPressAdapter implements ChannelAdapter {
  readonly type = ChannelType.BOTPRESS;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(private readonly account: ChannelAdapterConfig = {}) {}

  getCapabilities(): ChannelCapabilities {
    return {
      serviceWindow: false,
      requiresTemplatesOutsideWindow: false,
      supportsMedia: true,
      supportsDeliveryReceipts: false,
      supportsReadReceipts: false,
      supportsTyping: true,
      contactChannel: Channel.WEB,
    };
  }

  async verifyWebhook(
    req: WebhookVerification,
  ): Promise<WebhookVerificationResult> {
    const signature =
      req.headers.get("x-botpress-signature") ?? req.headers.get("x-signature");
    if (signature && process.env.BOTPRESS_SIGNING_SECRET) {
      return verifyBotPressSignature(req.rawBody, signature)
        ? { ok: true }
        : { ok: false, reason: "bad_signature" };
    }
    const secret = process.env.BOTPRESS_WEBHOOK_SECRET;
    if (!secret) return { ok: true, reason: "no_secret_configured" };
    const headerSecret =
      req.headers.get("x-botpress-secret") ??
      req.headers.get("x-webhook-secret");
    const authorization = req.headers.get("authorization");
    return headerSecret === secret || authorization === `Bearer ${secret}`
      ? { ok: true }
      : { ok: false, reason: "bad_secret" };
  }

  async normalizeWebhook(
    payload: Record<string, unknown>,
  ): Promise<NormalizedChannelEvent[]> {
    const webhook = normalizeBotPressWebhook(payload);
    if (!webhook.text && !webhook.messageId) return [];
    return [
      {
        kind: "message",
        externalId: webhook.messageId ?? null,
        channelUserId: webhook.userId,
        channelConversationId: webhook.conversationId,
        text: webhook.text ?? null,
        type: MessageType.TEXT,
        contact: webhook.contact,
        timestamp: new Date(),
        raw: webhook.raw,
      },
    ];
  }

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    const conversationId =
      (input.metadata?.conversationId as string) ?? "";
    const result = await sendBotPressMessage({
      userId: input.to,
      conversationId,
      type: "text",
      text: input.text,
      payload: input.text ? { text: input.text } : {},
    });
    return {
      ok: result.ok,
      skipped: "skipped" in result ? result.skipped : false,
      error: "reason" in result ? (result.reason ?? null) : null,
      raw: result,
    };
  }
}
