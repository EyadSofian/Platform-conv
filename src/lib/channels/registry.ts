import { ChannelType } from "@prisma/client";
import type { ChannelAccount } from "@prisma/client";
import { BotPressAdapter } from "./botpress";
import type { ChannelAdapter, ChannelAdapterConfig } from "./types";
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
    case ChannelType.BOTPRESS:
      return new BotPressAdapter(account);
    // Skeletons for upcoming channels reuse the closest working adapter until
    // their own implementation lands. They are intentionally explicit so the
    // switch stays exhaustive.
    case ChannelType.FACEBOOK_MESSENGER:
    case ChannelType.INSTAGRAM:
    case ChannelType.WEBCHAT:
    case ChannelType.TELEGRAM:
      throw new Error(`Channel adapter for ${type} is not implemented yet.`);
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

export function isImplementedChannel(type: ChannelType): boolean {
  return (
    type === ChannelType.WHATSAPP_CLOUD || type === ChannelType.BOTPRESS
  );
}
