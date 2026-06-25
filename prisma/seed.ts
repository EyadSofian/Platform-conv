import { hash } from "bcryptjs";
import {
  AutomationActionType,
  AutomationTriggerType,
  Availability,
  CampaignStatus,
  CampaignType,
  Channel,
  ChannelHealthStatus,
  ChannelType,
  ContactStatus,
  ConversationStatus,
  InboxStatus,
  MessageSender,
  OrgRole,
  UserRole,
} from "@prisma/client";
import { prisma } from "../src/lib/prisma";

async function main() {
  const password = await hash("password123", 10);

  const organization = await prisma.organization.upsert({
    where: { slug: "default" },
    update: {},
    create: { name: "Acme Support", slug: "default" },
  });

  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      name: "Nadia Admin",
      email: "admin@example.com",
      password,
      role: UserRole.ADMIN,
      availability: Availability.ONLINE,
    },
  });

  const agent = await prisma.user.upsert({
    where: { email: "agent@example.com" },
    update: { availability: Availability.ONLINE },
    create: {
      name: "Omar Sales",
      email: "agent@example.com",
      password,
      role: UserRole.SALES_AGENT,
      availability: Availability.ONLINE,
    },
  });

  await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: { organizationId: organization.id, userId: admin.id },
    },
    update: { role: OrgRole.OWNER },
    create: { organizationId: organization.id, userId: admin.id, role: OrgRole.OWNER },
  });

  await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: { organizationId: organization.id, userId: agent.id },
    },
    update: { role: OrgRole.AGENT },
    create: { organizationId: organization.id, userId: agent.id, role: OrgRole.AGENT },
  });

  const whatsappInbox = await prisma.inbox.upsert({
    where: { id: "demo-whatsapp-inbox" },
    update: {
      organizationId: organization.id,
      defaultAssigneeId: agent.id,
    },
    create: {
      id: "demo-whatsapp-inbox",
      organizationId: organization.id,
      name: "Sales WhatsApp",
      description: "Primary WhatsApp inbox for sales, AI suggestions, and takeover.",
      channelType: ChannelType.WHATSAPP_CLOUD,
      status: InboxStatus.ACTIVE,
      botEnabled: true,
      aiEnabled: true,
      defaultAssigneeId: agent.id,
      businessHours: {
        timezone: "Africa/Cairo",
        weekdays: ["sun", "mon", "tue", "wed", "thu"],
        from: "09:00",
        to: "18:00",
      },
    },
  });

  // Example WhatsApp Cloud channel account (credentials come from env at runtime).
  await prisma.channelAccount.upsert({
    where: { id: "demo-whatsapp-account" },
    update: { inboxId: whatsappInbox.id },
    create: {
      id: "demo-whatsapp-account",
      organizationId: organization.id,
      inboxId: whatsappInbox.id,
      type: ChannelType.WHATSAPP_CLOUD,
      name: "Primary WhatsApp",
      status: ChannelHealthStatus.MISSING_CONFIG,
      config: { note: "Set WHATSAPP_* env vars or fill credentials to activate." },
    },
  });

  const contact = await prisma.contact.upsert({
    where: { botpressUserId: "demo-bp-user-1" },
    update: { organizationId: organization.id },
    create: {
      organizationId: organization.id,
      name: "Maya Hassan",
      phone: "+201001234567",
      email: "maya@example.com",
      channel: Channel.WHATSAPP,
      botpressUserId: "demo-bp-user-1",
      botpressConvId: "demo-bp-conv-1",
      status: ContactStatus.ACTIVE,
      assignedAgentId: agent.id,
      tags: ["hot-lead", "pricing"],
      whatsappOptIn: true,
      whatsappOptInAt: new Date(),
      whatsappOptInSource: "demo_import",
      metadata: { company: "Northstar Retail" },
    },
  });

  await prisma.conversation.upsert({
    where: { contactId: contact.id },
    update: {
      organizationId: organization.id,
      inboxId: whatsappInbox.id,
      channelAccountId: "demo-whatsapp-account",
    },
    create: {
      contactId: contact.id,
      organizationId: organization.id,
      inboxId: whatsappInbox.id,
      channelAccountId: "demo-whatsapp-account",
      status: ConversationStatus.HUMAN,
      assignedAgentId: agent.id,
      unreadCount: 2,
      lastMessageAt: new Date(),
      lastCustomerMessageAt: new Date(),
    },
  });

  const existingMessages = await prisma.message.count({
    where: { contactId: contact.id },
  });

  if (!existingMessages) {
    await prisma.message.createMany({
      data: [
        {
          contactId: contact.id,
          sender: MessageSender.CUSTOMER,
          content: "Hi, I want to compare the sales automation plans.",
        },
        {
          contactId: contact.id,
          sender: MessageSender.BOT,
          content:
            "I can help with that. Are you looking for WhatsApp, web chat, or both?",
        },
        {
          contactId: contact.id,
          sender: MessageSender.CUSTOMER,
          content: "Both. Please connect me with a sales specialist.",
        },
      ],
    });
  }

  await prisma.campaign.upsert({
    where: { id: "demo-campaign-spring" },
    update: {},
    create: {
      id: "demo-campaign-spring",
      organizationId: organization.id,
      name: "Spring reactivation",
      message:
        "We have a new WhatsApp automation bundle for growing teams. Want a quick walkthrough?",
      type: CampaignType.BLAST,
      status: CampaignStatus.DRAFT,
      targetRules: { tags: ["pricing"], status: ["active"] },
      channel: Channel.WHATSAPP,
      templateName: "spring_reactivation_ar",
      templateLanguage: "ar_EG",
      respectOptIn: true,
      rateLimitPerMinute: 20,
      createdById: admin.id,
    },
  });

  await prisma.whatsAppTemplate.upsert({
    where: {
      name_language: {
        name: "spring_reactivation_ar",
        language: "ar_EG",
      },
    },
    update: {},
    create: {
      organizationId: organization.id,
      name: "spring_reactivation_ar",
      language: "ar_EG",
      category: "MARKETING",
      status: "APPROVED",
      qualityRating: "HIGH",
      components: {
        body: "عندنا باقة واتساب جديدة لفرق البيع. تحب تشوف ديمو سريع؟",
      },
      lastSyncedAt: new Date(),
    },
  });

  // Example outbound webhook integration (disabled until a URL is set).
  await prisma.integration.upsert({
    where: {
      organizationId_type_name: {
        organizationId: organization.id,
        type: "ZAPIER",
        name: "Zapier — new messages",
      },
    },
    update: {},
    create: {
      organizationId: organization.id,
      type: "ZAPIER",
      name: "Zapier — new messages",
      enabled: false,
      config: { url: "" },
      events: ["message.received"],
    },
  });

  // Example automation: tag conversations that mention pricing.
  await prisma.automationRule.upsert({
    where: { id: "demo-rule-pricing" },
    update: {},
    create: {
      id: "demo-rule-pricing",
      organizationId: organization.id,
      name: "Tag pricing questions",
      enabled: true,
      priority: 10,
      trigger: AutomationTriggerType.MESSAGE_KEYWORD,
      triggerConfig: { keywords: ["price", "pricing", "cost", "سعر"] },
      action: AutomationActionType.ADD_TAG,
      actionConfig: { tag: "pricing" },
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
