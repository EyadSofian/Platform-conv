import { z } from "zod";

const upper = (value: unknown) =>
  typeof value === "string" ? value.toUpperCase() : value;

export const channelSchema = z.preprocess(
  upper,
  z.enum(["WHATSAPP", "WEB", "TELEGRAM", "MESSENGER", "INSTAGRAM"]),
);

export const channelTypeSchema = z.preprocess(
  upper,
  z.enum([
    "WHATSAPP_CLOUD",
    "FACEBOOK_MESSENGER",
    "INSTAGRAM",
    "WEBCHAT",
    "TELEGRAM",
    "BOTPRESS",
  ]),
);

export const inboxStatusSchema = z.preprocess(
  upper,
  z.enum(["ACTIVE", "PAUSED", "DISCONNECTED"]),
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
  customFields: z.record(z.string(), z.unknown()).optional(),
  whatsappOptIn: z.boolean().default(false),
  whatsappOptInAt: z.string().datetime().optional().nullable(),
  whatsappOptInSource: z.string().trim().optional().nullable(),
  whatsappOptInEvidence: z.record(z.string(), z.unknown()).optional(),
  marketingPaused: z.boolean().default(false),
  unsubscribed: z.boolean().default(false),
  odooPartnerId: z.number().int().optional().nullable(),
  odooLeadId: z.number().int().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const contactUpdateSchema = contactCreateSchema.partial();

const emptyToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;

const optionalSecretString = z.preprocess(
  emptyToNull,
  z.string().trim().min(1).optional().nullable(),
);

export const inboxConnectionSchema = z.object({
  externalId: optionalSecretString,
  phoneNumberId: optionalSecretString,
  businessAccountId: optionalSecretString,
  pageId: optionalSecretString,
  instagramAccountId: optionalSecretString,
  webhookVerifyToken: optionalSecretString,
  accessToken: optionalSecretString,
});

export const inboxCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(240).optional().nullable(),
  channelType: channelTypeSchema.default("WHATSAPP_CLOUD"),
  status: inboxStatusSchema.default("DISCONNECTED"),
  botEnabled: z.boolean().default(true),
  aiEnabled: z.boolean().default(true),
  defaultAssigneeId: z.string().trim().optional().nullable(),
  businessHours: z.record(z.string(), z.unknown()).optional(),
  connection: inboxConnectionSchema.partial().optional(),
});

export const inboxUpdateSchema = inboxCreateSchema.partial();

export const sendMessageSchema = z.object({
  contactId: z.string().min(1),
  content: z.string().trim().min(1),
  type: messageTypeSchema.default("TEXT"),
  senderId: z.string().optional().nullable(),
  // Approved WhatsApp template used to reply outside the 24h service window.
  template: z
    .object({
      name: z.string().min(1),
      language: z.string().min(1).default("en_US"),
      variables: z.array(z.string()).optional(),
    })
    .optional(),
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
  // Derived from the session when omitted.
  createdById: z.string().optional().default(""),
});

export const templateCategorySchema = z.preprocess(
  upper,
  z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]),
);

export const templateStatusSchema = z.preprocess(
  upper,
  z.enum(["APPROVED", "PENDING", "REJECTED", "PAUSED", "DISABLED"]),
);

export const templateCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-z0-9_]+$/, "Use lowercase letters, numbers and underscores."),
  language: z.string().trim().min(2).default("en_US"),
  category: templateCategorySchema.default("MARKETING"),
  status: templateStatusSchema.default("PENDING"),
  components: z.unknown().optional(),
});

export const templateUpdateSchema = z.object({
  category: templateCategorySchema.optional(),
  status: templateStatusSchema.optional(),
  components: z.unknown().optional(),
});

export const templatePreviewSchema = z.object({
  variables: z.record(z.string(), z.string()).default({}),
});

export const automationTriggerSchema = z.preprocess(
  upper,
  z.enum([
    "NEW_CONVERSATION",
    "NEW_MESSAGE",
    "MESSAGE_KEYWORD",
    "CHANNEL_IS",
    "TAG_ADDED",
    "OUTSIDE_BUSINESS_HOURS",
    "NO_REPLY_AFTER",
  ]),
);

export const automationActionSchema = z.preprocess(
  upper,
  z.enum([
    "ASSIGN_AGENT",
    "ADD_TAG",
    "SEND_TEMPLATE",
    "SEND_WEBHOOK",
    "CREATE_LEAD",
    "NOTIFY",
    "HANDOFF_BOTPRESS",
    "CLOSE",
    "SNOOZE",
  ]),
);

export const automationRuleCreateSchema = z.object({
  name: z.string().trim().min(1),
  enabled: z.boolean().default(true),
  priority: z.number().int().min(0).max(1000).default(0),
  trigger: automationTriggerSchema,
  triggerConfig: z.record(z.string(), z.unknown()).optional(),
  action: automationActionSchema,
  actionConfig: z.record(z.string(), z.unknown()).optional(),
});

export const automationRuleUpdateSchema = automationRuleCreateSchema.partial();

export const integrationTypeSchema = z.preprocess(
  upper,
  z.enum(["ODOO", "HUBSPOT", "SHOPIFY", "ZAPIER", "WEBHOOK", "BOTPRESS"]),
);

export const integrationCreateSchema = z.object({
  type: integrationTypeSchema,
  name: z.string().trim().min(1),
  enabled: z.boolean().default(true),
  config: z.record(z.string(), z.unknown()).optional(),
  credentials: z.record(z.string(), z.unknown()).optional(),
  events: z.array(z.string()).default([]),
});

export const integrationUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  credentials: z.record(z.string(), z.unknown()).optional(),
  events: z.array(z.string()).optional(),
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
