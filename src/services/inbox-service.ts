import {
  ChannelHealthStatus,
  ChannelType,
  InboxStatus,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  inboxCreateSchema,
  inboxUpdateSchema,
} from "@/lib/validators";
import type { z } from "zod";

export type InboxCreateInput = z.infer<typeof inboxCreateSchema>;
export type InboxUpdateInput = z.infer<typeof inboxUpdateSchema>;

const inboxInclude = {
  defaultAssignee: {
    select: { id: true, name: true, email: true, availability: true },
  },
  channelConnection: {
    select: {
      id: true,
      type: true,
      name: true,
      status: true,
      externalId: true,
      phoneNumberId: true,
      businessAccountId: true,
      webhookVerifyToken: true,
      lastWebhookAt: true,
      lastErrorAt: true,
      lastError: true,
      createdAt: true,
      updatedAt: true,
      config: true,
    },
  },
  _count: { select: { conversations: true } },
} satisfies Prisma.InboxInclude;

const providerLabel: Record<ChannelType, string> = {
  WHATSAPP_CLOUD: "WhatsApp Cloud",
  FACEBOOK_MESSENGER: "Facebook Messenger",
  INSTAGRAM: "Instagram",
  WEBCHAT: "Webchat",
  TELEGRAM: "Telegram",
  BOTPRESS: "BotPress",
};

function nullable(value: string | null | undefined) {
  return value?.trim() ? value.trim() : null;
}

function connectionConfig(input: InboxCreateInput["connection"]) {
  if (!input) return undefined;
  return {
    pageId: nullable(input.pageId),
    instagramAccountId: nullable(input.instagramAccountId),
  } satisfies Prisma.InputJsonObject;
}

function connectionCredentials(input: InboxCreateInput["connection"]) {
  const accessToken = nullable(input?.accessToken);
  return accessToken ? ({ accessToken } satisfies Prisma.InputJsonObject) : undefined;
}

function hasConnectionDetails(input: InboxCreateInput["connection"]) {
  if (!input) return false;
  return Object.values(input).some((value) => nullable(value as string | null));
}

function toInboxStatus(value: unknown) {
  return value ? (value as InboxStatus) : undefined;
}

function toChannelType(value: unknown) {
  return value ? (value as ChannelType) : undefined;
}

function buildChannelCreateData(
  organizationId: string,
  inboxId: string,
  input: InboxCreateInput,
): Prisma.ChannelAccountCreateInput {
  const connection = input.connection;
  const type = input.channelType as ChannelType;

  return {
    organization: { connect: { id: organizationId } },
    inbox: { connect: { id: inboxId } },
    type,
    name: `${input.name} ${providerLabel[type]} connection`,
    status: hasConnectionDetails(connection)
      ? ChannelHealthStatus.MISSING_CONFIG
      : ChannelHealthStatus.DISCONNECTED,
    externalId: nullable(connection?.externalId),
    phoneNumberId: nullable(connection?.phoneNumberId),
    businessAccountId: nullable(connection?.businessAccountId),
    webhookVerifyToken: nullable(connection?.webhookVerifyToken),
    config: connectionConfig(connection),
    credentials: connectionCredentials(connection),
  };
}

function buildChannelUpdateData(
  input: InboxUpdateInput,
): Prisma.ChannelAccountUpdateInput {
  const connection = input.connection;
  const update: Prisma.ChannelAccountUpdateInput = {};

  if (input.name || input.channelType) {
    const type = toChannelType(input.channelType);
    update.name = input.name
      ? `${input.name} ${providerLabel[type ?? ChannelType.WHATSAPP_CLOUD]} connection`
      : undefined;
    update.type = type;
  }

  if (connection) {
    update.externalId = nullable(connection.externalId);
    update.phoneNumberId = nullable(connection.phoneNumberId);
    update.businessAccountId = nullable(connection.businessAccountId);
    update.webhookVerifyToken = nullable(connection.webhookVerifyToken);
    update.config = connectionConfig(connection);
    const credentials = connectionCredentials(connection);
    if (credentials) update.credentials = credentials;
    if (hasConnectionDetails(connection)) {
      update.status = ChannelHealthStatus.MISSING_CONFIG;
    }
  }

  return update;
}

export async function listInboxes(organizationId: string) {
  return prisma.inbox.findMany({
    where: { organizationId },
    include: inboxInclude,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
}

export async function getInbox(organizationId: string, id: string) {
  return prisma.inbox.findFirst({
    where: { id, organizationId },
    include: inboxInclude,
  });
}

export async function createInbox(
  organizationId: string,
  input: InboxCreateInput,
) {
  const inbox = await prisma.$transaction(async (tx) => {
    const created = await tx.inbox.create({
      data: {
        organizationId,
        name: input.name,
        description: input.description ?? null,
        channelType: input.channelType as ChannelType,
        status: input.status as InboxStatus,
        botEnabled: input.botEnabled,
        aiEnabled: input.aiEnabled,
        defaultAssigneeId: input.defaultAssigneeId || null,
        businessHours: input.businessHours as Prisma.InputJsonObject | undefined,
      },
    });

    await tx.channelAccount.create({
      data: buildChannelCreateData(organizationId, created.id, input),
    });

    return created;
  });

  return getInbox(organizationId, inbox.id);
}

export async function updateInbox(
  organizationId: string,
  id: string,
  input: InboxUpdateInput,
) {
  const inbox = await prisma.$transaction(async (tx) => {
    const existing = await tx.inbox.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });

    if (!existing) {
      throw new InboxNotFoundError();
    }

    const updated = await tx.inbox.update({
      where: { id },
      data: {
        name: input.name,
        description:
          input.description === undefined ? undefined : input.description,
        channelType: toChannelType(input.channelType),
        status: toInboxStatus(input.status),
        botEnabled: input.botEnabled,
        aiEnabled: input.aiEnabled,
        defaultAssigneeId:
          input.defaultAssigneeId === undefined
            ? undefined
            : input.defaultAssigneeId || null,
        businessHours:
          input.businessHours === undefined
            ? undefined
            : (input.businessHours as Prisma.InputJsonObject),
      },
    });

    const channelUpdate = buildChannelUpdateData(input);
    const hasChannelUpdate = Object.keys(channelUpdate).length > 0;
    if (hasChannelUpdate) {
      await tx.channelAccount.upsert({
        where: { inboxId: id },
        create: buildChannelCreateData(organizationId, id, {
          name: updated.name,
          description: updated.description,
          channelType: updated.channelType,
          status: updated.status,
          botEnabled: updated.botEnabled,
          aiEnabled: updated.aiEnabled,
          defaultAssigneeId: updated.defaultAssigneeId,
          businessHours:
            (updated.businessHours as Record<string, unknown> | null) ?? undefined,
          connection: input.connection,
        }),
        update: channelUpdate,
      });
    }

    return updated;
  });

  return getInbox(organizationId, inbox.id);
}

export class InboxNotFoundError extends Error {
  status = 404;
  constructor() {
    super("Inbox not found.");
    this.name = "InboxNotFoundError";
  }
}

