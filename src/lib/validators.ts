import { z } from "zod";

const upper = (value: unknown) =>
  typeof value === "string" ? value.toUpperCase() : value;

export const channelSchema = z.preprocess(
  upper,
  z.enum(["WHATSAPP", "WEB", "TELEGRAM", "MESSENGER"]),
);

export const contactStatusSchema = z.preprocess(
  upper,
  z.enum(["ACTIVE", "CLOSED", "PENDING"]),
);

export const conversationStatusSchema = z.preprocess(
  upper,
  z.enum(["BOT", "HUMAN", "CLOSED"]),
);

export const messageTypeSchema = z.preprocess(
  upper,
  z.enum(["TEXT", "IMAGE", "FILE", "NOTE", "QUICK_REPLY", "BUTTONS"]),
);

export const userRoleSchema = z.preprocess(
  upper,
  z.enum(["ADMIN", "SUPERVISOR", "SALES_AGENT", "VIEWER"]),
);

export const campaignTypeSchema = z.preprocess(
  upper,
  z.enum(["BLAST", "DRIP"]),
);

export const campaignStatusSchema = z.preprocess(
  upper,
  z.enum(["DRAFT", "SCHEDULED", "RUNNING", "COMPLETED", "PAUSED"]),
);

export const contactCreateSchema = z.object({
  name: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  email: z.string().trim().email().optional().nullable(),
  channel: channelSchema.default("WEB"),
  botpressUserId: z.string().trim().optional().nullable(),
  botpressConvId: z.string().trim().optional().nullable(),
  status: contactStatusSchema.default("ACTIVE"),
  assignedAgentId: z.string().trim().optional().nullable(),
  tags: z.array(z.string().trim()).default([]),
  whatsappOptIn: z.boolean().default(false),
  whatsappOptInAt: z.string().datetime().optional().nullable(),
  whatsappOptInSource: z.string().trim().optional().nullable(),
  marketingPaused: z.boolean().default(false),
  odooPartnerId: z.number().int().optional().nullable(),
  odooLeadId: z.number().int().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const contactUpdateSchema = contactCreateSchema.partial();

export const sendMessageSchema = z.object({
  contactId: z.string().min(1),
  content: z.string().trim().min(1),
  type: messageTypeSchema.default("TEXT"),
  senderId: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const assignConversationSchema = z.object({
  agentId: z.string().min(1),
});

export const campaignCreateSchema = z.object({
  name: z.string().trim().min(1),
  message: z.string().trim().min(1),
  type: campaignTypeSchema.default("BLAST"),
  status: campaignStatusSchema.default("DRAFT"),
  targetRules: z
    .object({
      tags: z.array(z.string()).optional(),
      status: z.array(contactStatusSchema).optional(),
      agentId: z.string().optional().nullable(),
      channel: z.array(channelSchema).optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    })
    .default({}),
  channel: channelSchema.default("WHATSAPP"),
  templateName: z.string().trim().optional().nullable(),
  templateLanguage: z.string().trim().default("en_US"),
  respectOptIn: z.boolean().default(true),
  rateLimitPerMinute: z.number().int().min(1).max(1000).default(30),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).default("21:00"),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).default("09:00"),
  timezone: z.string().default("Africa/Cairo"),
  scheduledAt: z.string().datetime().optional().nullable(),
  createdById: z.string().min(1),
});

export const botpressWebhookSchema = z.object({
  event: z.string().optional(),
  type: z.string().optional(),
  userId: z.string().optional(),
  conversationId: z.string().optional(),
  messageId: z.string().optional(),
  text: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  user: z.record(z.string(), z.unknown()).optional(),
  contact: z.record(z.string(), z.unknown()).optional(),
  channel: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const actionBaseSchema = z.object({
  botpressUserId: z.string().optional(),
  botpressConvId: z.string().optional(),
  contactId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
