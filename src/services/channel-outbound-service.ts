import {
  Channel,
  ChannelType,
  MessageStatus,
  MessageType,
} from "@prisma/client";
import type { Contact, Conversation } from "@prisma/client";
import {
  adapterFromAccount,
  getChannelAdapter,
} from "../lib/channels/registry";
import type { SendMessageInput } from "../lib/channels/types";
import { prisma } from "../lib/prisma";
import { getWhatsAppAccountForOrg } from "./channel-account-service";

const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isWithinServiceWindow(
  conversation: Pick<Conversation, "lastCustomerMessageAt">,
  now = new Date(),
): boolean {
  if (!conversation.lastCustomerMessageAt) return false;
  return (
    now.getTime() - conversation.lastCustomerMessageAt.getTime() <
    SERVICE_WINDOW_MS
  );
}

export class ServiceWindowError extends Error {
  status = 409;
  constructor() {
    super(
      "Outside the 24-hour WhatsApp service window. Send an approved template instead.",
    );
    this.name = "ServiceWindowError";
  }
}

type DeliveryResult = {
  ok: boolean;
  skipped?: boolean;
  externalId?: string | null;
  error?: string | null;
};

/**
 * Delivers an agent reply through the WhatsApp Cloud adapter, enforcing the
 * 24-hour customer service window (free-form text only inside the window;
 * approved templates outside it). Updates the stored message with the provider
 * id and status.
 */
export async function deliverWhatsAppReply(params: {
  contact: Contact;
  conversation: Conversation;
  messageId: string;
  type: MessageType;
  content: string;
  template?: { name: string; language: string; variables?: string[] };
}): Promise<DeliveryResult> {
  const { contact, conversation, messageId, content, template } = params;

  if (!contact.phone) {
    await markFailed(messageId, "missing_phone");
    return { ok: false, error: "Contact has no phone number." };
  }

  if (!template && !isWithinServiceWindow(conversation)) {
    await markFailed(messageId, "outside_service_window");
    throw new ServiceWindowError();
  }

  const account = await getWhatsAppAccountForOrg(conversation.organizationId);
  const adapter = account
    ? adapterFromAccount(account)
    : getChannelAdapter(ChannelType.WHATSAPP_CLOUD);

  const input: SendMessageInput = template
    ? { to: contact.phone, type: MessageType.TEXT, template }
    : { to: contact.phone, type: MessageType.TEXT, text: content };

  const result = await adapter.sendMessage(input);

  if (result.skipped) {
    // No live credentials — keep the message as pending so a real send can be
    // wired later without losing the agent's text.
    return { ok: false, skipped: true, error: result.error };
  }

  if (!result.ok) {
    await markFailed(messageId, result.error ?? "send_failed");
    return { ok: false, error: result.error };
  }

  await prisma.message.update({
    where: { id: messageId },
    data: {
      status: MessageStatus.SENT,
      externalId: result.externalId ?? undefined,
      channelAccountId: account?.id ?? undefined,
    },
  });

  return { ok: true, externalId: result.externalId };
}

async function markFailed(messageId: string, reason: string) {
  await prisma.message.update({
    where: { id: messageId },
    data: { status: MessageStatus.FAILED, failedReason: reason },
  });
}

export function contactUsesWhatsApp(contact: Pick<Contact, "channel">): boolean {
  return contact.channel === Channel.WHATSAPP;
}
