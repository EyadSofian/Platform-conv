import type { Channel, ChannelType, MessageType } from "@prisma/client";

/**
 * Channel adapter abstraction.
 *
 * Every channel (WhatsApp Cloud, Messenger, Instagram, Webchat, Telegram,
 * BotPress, ...) implements the same `ChannelAdapter` contract so the platform
 * can ingest and send messages through a single normalized model. BotPress is
 * just one adapter among many — it is no longer the core architecture.
 */

export type NormalizedDirection = "inbound" | "outbound";

/** A normalized inbound event produced from a raw channel webhook payload. */
export type NormalizedChannelEvent =
  | NormalizedMessageEvent
  | NormalizedStatusEvent;

export type NormalizedMessageEvent = {
  kind: "message";
  /** Provider message id (e.g. WhatsApp `wamid`) used for idempotency. */
  externalId?: string | null;
  /** Stable per-channel identity for the sender (phone, PSID, chat id). */
  channelUserId: string;
  /** Channel-native conversation/thread id when the provider exposes one. */
  channelConversationId?: string | null;
  text?: string | null;
  type: MessageType;
  /** Best-effort contact identity extracted from the payload. */
  contact: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
  };
  /** Provider-specific media descriptor (placeholder for media handling). */
  media?: {
    kind: "image" | "document" | "audio" | "video";
    id?: string | null;
    url?: string | null;
    mimeType?: string | null;
    caption?: string | null;
  } | null;
  timestamp?: Date | null;
  raw: Record<string, unknown>;
};

export type NormalizedStatusEvent = {
  kind: "status";
  /** Provider message id the status refers to. */
  externalId: string;
  status: "sent" | "delivered" | "read" | "failed";
  channelUserId?: string | null;
  errorReason?: string | null;
  timestamp?: Date | null;
  raw: Record<string, unknown>;
};

export type SendMessageInput = {
  /** Recipient channel identity (phone in E.164 for WhatsApp, PSID, etc.). */
  to: string;
  type: MessageType;
  text?: string;
  /** Template send (used for out-of-window / marketing on WhatsApp). */
  template?: {
    name: string;
    language: string;
    variables?: string[];
  };
  media?: {
    kind: "image" | "document" | "audio" | "video";
    url?: string;
    id?: string;
    caption?: string;
  };
  metadata?: Record<string, unknown>;
};

export type SendMessageResult = {
  ok: boolean;
  /** Provider message id when the send succeeded. */
  externalId?: string | null;
  /** True when no live credentials were configured and the send was a no-op. */
  skipped?: boolean;
  error?: string | null;
  raw?: unknown;
};

export type ChannelCapabilities = {
  /** Supports free-form replies only inside a service window (WhatsApp 24h). */
  serviceWindow: boolean;
  serviceWindowHours?: number;
  /** Requires approved templates for messages outside the service window. */
  requiresTemplatesOutsideWindow: boolean;
  supportsMedia: boolean;
  supportsDeliveryReceipts: boolean;
  supportsReadReceipts: boolean;
  supportsTyping: boolean;
  /** The legacy `Channel` enum value this channel maps onto for Contact rows. */
  contactChannel: Channel;
};

/** Runtime configuration resolved from a `ChannelAccount` row or env fallback. */
export type ChannelAdapterConfig = {
  channelAccountId?: string | null;
  organizationId?: string | null;
  /** Non-secret config (phone number id, business account id, page id...). */
  config?: Record<string, unknown> | null;
  /** Secrets (access token, app secret). Never expose to the client. */
  credentials?: Record<string, unknown> | null;
  webhookVerifyToken?: string | null;
};

export interface ChannelAdapter {
  readonly type: ChannelType;

  /** Verify an inbound webhook request (signature and/or challenge). */
  verifyWebhook(req: WebhookVerification): Promise<WebhookVerificationResult>;

  /** Convert a raw webhook payload into normalized platform events. */
  normalizeWebhook(
    payload: Record<string, unknown>,
  ): Promise<NormalizedChannelEvent[]>;

  /** Send an outbound message through the channel. */
  sendMessage(input: SendMessageInput): Promise<SendMessageResult>;

  getCapabilities(): ChannelCapabilities;
}

export type WebhookVerification = {
  method: string;
  url: string;
  headers: Headers;
  rawBody: string;
};

export type WebhookVerificationResult = {
  ok: boolean;
  /** For hub-challenge style GET verification, the body to echo back. */
  challenge?: string;
  reason?: string;
};
