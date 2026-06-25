import { MessageSender } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ConversationAssistance = {
  summary: string;
  sentiment: "positive" | "neutral" | "negative";
  urgency: "low" | "medium" | "high";
  suggestedReplies: string[];
  suggestedTags: string[];
};

function firstName(name?: string | null) {
  return name?.trim().split(/\s+/)[0] || "there";
}

function classifyUrgency(text: string): ConversationAssistance["urgency"] {
  if (/(urgent|asap|now|immediately|angry|refund|cancel|broken)/i.test(text)) {
    return "high";
  }
  if (/(today|soon|problem|issue|price|demo|call)/i.test(text)) return "medium";
  return "low";
}

function classifySentiment(text: string): ConversationAssistance["sentiment"] {
  if (/(thanks|great|good|perfect|interested|love)/i.test(text)) {
    return "positive";
  }
  if (/(bad|angry|wrong|not working|refund|cancel|hate)/i.test(text)) {
    return "negative";
  }
  return "neutral";
}

function suggestedTags(text: string) {
  const tags = new Set<string>();
  if (/(price|pricing|cost|plan|plans)/i.test(text)) tags.add("pricing");
  if (/(demo|call|meeting|walkthrough)/i.test(text)) tags.add("demo");
  if (/(refund|cancel|complaint|not working|broken)/i.test(text)) {
    tags.add("support-risk");
  }
  if (/(whatsapp|instagram|facebook|messenger)/i.test(text)) {
    tags.add("channel-question");
  }
  return Array.from(tags).slice(0, 4);
}

function replySuggestions(name: string, text: string) {
  if (/(price|pricing|cost|plan|plans)/i.test(text)) {
    return [
      `Hi ${name}, I can help you pick the right plan based on your monthly conversation volume.`,
      "Would you prefer a quick pricing summary or a short demo first?",
      "How many agents and channels do you want to manage from the platform?",
    ];
  }

  if (/(demo|call|meeting|walkthrough)/i.test(text)) {
    return [
      `Absolutely ${name}. I can arrange a short walkthrough and show the inbox, bot controls, and campaigns.`,
      "What time works best today for a 15-minute demo?",
      "Should the demo focus on WhatsApp only or all channels?",
    ];
  }

  if (/(refund|cancel|complaint|not working|broken)/i.test(text)) {
    return [
      `I hear you ${name}. I will check this carefully and help resolve it as quickly as possible.`,
      "Can you send the account phone number or order reference so I can investigate?",
      "I am pausing automation for this conversation while we handle it manually.",
    ];
  }

  return [
    `Thanks ${name}. I am checking this now and will help you from here.`,
    "Can you share one more detail so I can route this correctly?",
    "I can connect you with the right specialist if you prefer human support.",
  ];
}

export async function generateConversationAssistance(
  organizationId: string,
  conversationId: string,
): Promise<ConversationAssistance> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, organizationId },
    include: {
      contact: true,
      inbox: { select: { name: true, channelType: true } },
    },
  });

  if (!conversation) {
    throw new ConversationAssistanceNotFoundError();
  }

  const messages = await prisma.message.findMany({
    where: { contactId: conversation.contactId },
    orderBy: { createdAt: "desc" },
    take: 12,
  });

  const customerMessages = messages.filter(
    (message) => message.sender === MessageSender.CUSTOMER,
  );
  const latestCustomerText = customerMessages[0]?.content ?? "";
  const combinedCustomerText = customerMessages
    .map((message) => message.content)
    .join("\n");
  const contactName = firstName(conversation.contact.name);
  const text = `${latestCustomerText}\n${combinedCustomerText}`;

  const summary = latestCustomerText
    ? `${conversation.contact.name ?? "Customer"} is discussing ${
        conversation.inbox?.name ?? "this inbox"
      }. Latest message: ${latestCustomerText.slice(0, 180)}`
    : "No customer message is available yet. Wait for a customer reply before generating a summary.";

  return {
    summary,
    sentiment: classifySentiment(text),
    urgency: classifyUrgency(text),
    suggestedReplies: replySuggestions(contactName, text),
    suggestedTags: suggestedTags(text),
  };
}

export class ConversationAssistanceNotFoundError extends Error {
  status = 404;
  constructor() {
    super("Conversation not found.");
    this.name = "ConversationAssistanceNotFoundError";
  }
}
