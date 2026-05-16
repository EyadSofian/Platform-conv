import {
  Availability,
  ContactStatus,
  ConversationStatus,
  Channel,
  MessageSender,
  MessageType,
  Prisma,
  UserRole,
} from "@prisma/client";
import { prisma } from "../lib/prisma";
import { emitRealtime } from "../lib/realtime";
import type { NormalizedBotPressWebhook } from "../types/platform";

export async function chooseAvailableAgent() {
  const agents = await prisma.user.findMany({
    where: {
      role: { in: [UserRole.SALES_AGENT, UserRole.SUPERVISOR] },
      availability: { in: [Availability.ONLINE, Availability.BUSY] },
    },
    orderBy: [{ lastAssignedAt: "asc" }, { createdAt: "asc" }],
  });

  return agents[0] ?? null;
}

export async function ensureConversationForContact(contactId: string) {
  return prisma.conversation.upsert({
    where: { contactId },
    create: { contactId, status: ConversationStatus.BOT },
    update: {},
    include: {
      contact: true,
      assignedAgent: {
        select: { id: true, name: true, email: true, availability: true },
      },
    },
  });
}

export async function findContactByBotPress(
  botpressUserId?: string | null,
  botpressConvId?: string | null,
) {
  if (!botpressUserId && !botpressConvId) return null;

  return prisma.contact.findFirst({
    where: {
      OR: [
        ...(botpressUserId ? [{ botpressUserId }] : []),
        ...(botpressConvId ? [{ botpressConvId }] : []),
      ],
    },
  });
}

export async function upsertBotPressContact(
  webhook: NormalizedBotPressWebhook,
) {
  const existing = await findContactByBotPress(
    webhook.userId,
    webhook.conversationId,
  );

  const contact = existing
    ? await prisma.contact.update({
        where: { id: existing.id },
        data: {
          botpressUserId: webhook.userId || existing.botpressUserId,
          botpressConvId: webhook.conversationId || existing.botpressConvId,
          channel: webhook.channel,
          name: existing.name ?? webhook.contact.name,
          phone: existing.phone ?? webhook.contact.phone,
          email: existing.email ?? webhook.contact.email,
          metadata: {
            ...((existing.metadata as Prisma.JsonObject | null) ?? {}),
            ...webhook.metadata,
          } as Prisma.InputJsonObject,
        },
      })
    : await prisma.contact.create({
        data: {
          botpressUserId: webhook.userId || null,
          botpressConvId: webhook.conversationId || null,
          channel: webhook.channel,
          name: webhook.contact.name,
          phone: webhook.contact.phone,
          email: webhook.contact.email,
          metadata: webhook.metadata as Prisma.InputJsonObject,
        },
      });

  const { created, conversation } = await ensureConversationForContactReturning(
    contact.id,
  );

  if (created) {
    await emitRealtime({
      type: "conversation.updated",
      payload: conversation,
    });
  }

  return contact;
}

async function ensureConversationForContactReturning(contactId: string) {
  const existing = await prisma.conversation.findUnique({
    where: { contactId },
  });

  if (existing) {
    const conversation = await prisma.conversation.findUnique({
      where: { contactId },
      include: {
        contact: true,
        assignedAgent: {
          select: { id: true, name: true, email: true, availability: true },
        },
      },
    });
    return { created: false, conversation: conversation! };
  }

  const conversation = await prisma.conversation.create({
    data: { contactId, status: ConversationStatus.BOT },
    include: {
      contact: true,
      assignedAgent: {
        select: { id: true, name: true, email: true, availability: true },
      },
    },
  });

  return { created: true, conversation };
}

export async function closeBotPressConversation(contactId: string) {
  const conversation = await prisma.conversation.update({
    where: { contactId },
    data: {
      status: ConversationStatus.CLOSED,
      closedAt: new Date(),
      unreadCount: 0,
    },
    include: {
      contact: true,
      assignedAgent: {
        select: { id: true, name: true, email: true, availability: true },
      },
    },
  });

  await prisma.contact.update({
    where: { id: contactId },
    data: { status: ContactStatus.CLOSED },
  });

  await emitRealtime({
    type: "conversation.updated",
    room: `conversation:${conversation.id}`,
    payload: conversation,
  });
  await emitRealtime({
    type: "conversation.updated",
    payload: conversation,
  });

  return conversation;
}

export async function recordMessage(input: {
  contactId: string;
  content: string;
  sender: MessageSender;
  type?: MessageType;
  senderId?: string | null;
  isNote?: boolean;
  botpressMessageId?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const message = await tx.message.create({
      data: {
        contactId: input.contactId,
        content: input.content,
        sender: input.sender,
        senderId: input.senderId,
        type: input.type ?? (input.isNote ? MessageType.NOTE : MessageType.TEXT),
        isNote: input.isNote ?? false,
        botpressMessageId: input.botpressMessageId,
        metadata: input.metadata,
      },
      include: { contact: true },
    });

    const conversation = await tx.conversation.upsert({
      where: { contactId: input.contactId },
      create: {
        contactId: input.contactId,
        status: ConversationStatus.BOT,
        lastMessageAt: now,
        unreadCount: input.sender === MessageSender.CUSTOMER ? 1 : 0,
      },
      update: {
        lastMessageAt: now,
        unreadCount:
          input.sender === MessageSender.CUSTOMER
            ? { increment: 1 }
            : undefined,
      },
      include: {
        contact: true,
        assignedAgent: {
          select: { id: true, name: true, email: true, availability: true },
        },
      },
    });

    return { message, conversation };
  });

  await emitRealtime({
    type: "message.created",
    room: `conversation:${result.conversation.id}`,
    payload: result.message,
  });
  await emitRealtime({
    type: "conversation.updated",
    payload: result.conversation,
  });

  return result;
}

export async function requestHumanHandoff(contactId: string) {
  const agent = await chooseAvailableAgent();
  const conversation = await prisma.conversation.update({
    where: { contactId },
    data: {
      status: ConversationStatus.HUMAN,
      assignedAgentId: agent?.id,
    },
    include: {
      contact: true,
      assignedAgent: {
        select: { id: true, name: true, email: true, availability: true },
      },
    },
  });

  if (agent) {
    await prisma.user.update({
      where: { id: agent.id },
      data: { lastAssignedAt: new Date() },
    });

    await prisma.notification.create({
      data: {
        userId: agent.id,
        type: "HANDOFF_REQUEST",
        title: "Bot requested handoff",
        body: `${conversation.contact.name ?? "A customer"} needs an agent.`,
        metadata: { contactId, conversationId: conversation.id },
      },
    });
  }

  await emitRealtime({
    type: "conversation.updated",
    payload: conversation,
  });

  return conversation;
}

export async function getConversationWithMessages(
  conversationId: string,
  options: { limit?: number; before?: string } = {},
) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      contact: true,
      assignedAgent: {
        select: { id: true, name: true, email: true, availability: true },
      },
    },
  });

  if (!conversation) return null;

  const take = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const messages = await prisma.message.findMany({
    where: {
      contactId: conversation.contactId,
      ...(options.before
        ? { createdAt: { lt: new Date(options.before) } }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      senderAgent: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  return {
    conversation,
    messages: messages.reverse(),
  };
}

export async function listConversations(filters: {
  status?: string;
  agentId?: string;
  tag?: string;
  channel?: string;
  q?: string;
  unassigned?: boolean;
}) {
  return prisma.conversation.findMany({
    where: {
      status: filters.status
        ? (filters.status.toUpperCase() as ConversationStatus)
        : undefined,
      assignedAgentId: filters.unassigned
        ? null
        : filters.agentId,
      contact: {
        channel: filters.channel
          ? (filters.channel.toUpperCase() as Channel)
          : undefined,
        tags: filters.tag ? { has: filters.tag } : undefined,
        OR: filters.q
          ? [
              { name: { contains: filters.q, mode: "insensitive" } },
              { phone: { contains: filters.q, mode: "insensitive" } },
              { email: { contains: filters.q, mode: "insensitive" } },
            ]
          : undefined,
      },
    },
    include: {
      contact: true,
      assignedAgent: {
        select: { id: true, name: true, email: true, availability: true },
      },
    },
    orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
    take: 100,
  });
}
