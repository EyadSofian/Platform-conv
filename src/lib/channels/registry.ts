import { ChannelType } from "@prisma/client";
import type { ChannelAccount } from "@prisma/client";
import { BotPressAdapter } from "./botpress";
import { MetaMessagingAdapter } from "./meta-messaging";
import { TelegramAdapter } from "./telegram";
import type { ChannelAdapter, ChannelAdapterConfig } from "./types";
import { WebchatAdapter } from "./webchat";
import { WhatsAppCloudAdapter } from "./whatsapp-cloud";

export * from "./types";

/**
 * Resolve a `ChannelAdapter` for a given channel type. Pass a `ChannelAccount`
 * (or a plain config object) to bind tenant-specific credentials; otherwise the
 * adapter falls back to environment variables.
 */
export function getChannelAdapter(
  type: ChannelType,
  account?: ChannelAdapterConfig,
): ChannelAdapter {
  switch (type) {
    case ChannelType.WHATSAPP_CLOUD:
      return new WhatsAppCloudAdapter(account);
    case ChannelType.FACEBOOK_MESSENGER:
      return new MetaMessagingAdapter(ChannelType.FACEBOOK_MESSENGER, account);
    case ChannelType.INSTAGRAM:
      return new MetaMessagingAdapter(ChannelType.INSTAGRAM, account);
    case ChannelType.TELEGRAM:
      return new TelegramAdapter(account);
    case ChannelType.WEBCHAT:
      return new WebchatAdapter(account);
    case ChannelType.BOTPRESS:
      return new BotPressAdapter(account);
    default:
      throw new Error(`Unknown channel type: ${type as string}`);
  }
}

export function adapterFromAccount(account: ChannelAccount): ChannelAdapter {
  return getChannelAdapter(account.type, {
    channelAccountId: account.id,
    organizationId: account.organizationId,
    config: account.config as Record<string, unknown> | null,
    credentials: account.credentials as Record<string, unknown> | null,
    webhookVerifyToken: account.webhookVerifyToken,
  });
}

const IMPLEMENTED = new Set<ChannelType>([
  ChannelType.WHATSAPP_CLOUD,
  ChannelType.FACEBOOK_MESSENGER,
  ChannelType.INSTAGRAM,
  ChannelType.TELEGRAM,
  ChannelType.WEBCHAT,
  ChannelType.BOTPRESS,
]);

export function isImplementedChannel(type: ChannelType): boolean {
  return IMPLEMENTED.has(type);
}
