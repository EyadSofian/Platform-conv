import type {
  Channel,
  Contact,
  Conversation,
  Message,
  User,
} from "@prisma/client";

export type ConversationWithContact = Conversation & {
  contact: Contact;
  assignedAgent?: Pick<User, "id" | "name" | "email" | "availability"> | null;
};

export type MessageWithContact = Message & {
  contact?: Contact;
};

export type RealtimeEvent =
  | {
      type: "conversation.updated";
      room?: string;
      payload: ConversationWithContact | Record<string, unknown>;
    }
  | {
      type: "message.created";
      room?: string;
      payload: MessageWithContact | Record<string, unknown>;
    }
  | {
      type: "notification.created";
      room?: string;
      payload: Record<string, unknown>;
    }
  | {
      type: "campaign.updated";
      room?: string;
      payload: Record<string, unknown>;
    };

export type BotPressOutboundMessage = {
  userId: string;
  conversationId: string;
  messageId: string;
  type: "text" | "image" | "file" | "event";
  text?: string;
  payload?: Record<string, unknown>;
};

export type NormalizedBotPressWebhook = {
  event: string;
  userId: string;
  conversationId: string;
  messageId?: string;
  text?: string;
  channel: Channel;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
  raw: Record<string, unknown>;
  contact: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
  };
};
