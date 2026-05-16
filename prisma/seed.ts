import { hash } from "bcryptjs";
import {
  Availability,
  CampaignStatus,
  CampaignType,
  Channel,
  ContactStatus,
  ConversationStatus,
  MessageSender,
  UserRole,
} from "@prisma/client";
import { prisma } from "../src/lib/prisma";

async function main() {
  const password = await hash("password123", 10);

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

  const contact = await prisma.contact.upsert({
    where: { botpressUserId: "demo-bp-user-1" },
    update: {},
    create: {
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
    update: {},
    create: {
      contactId: contact.id,
      status: ConversationStatus.HUMAN,
      assignedAgentId: agent.id,
      unreadCount: 2,
      lastMessageAt: new Date(),
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
