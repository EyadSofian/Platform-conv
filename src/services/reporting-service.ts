import { ConversationStatus, MessageSender } from "@prisma/client";
import { prisma } from "../lib/prisma";

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

/**
 * Computes the org-scoped reporting dashboard: channel mix, open vs closed,
 * first-response and resolution times, agent workload, campaign performance,
 * template performance, and contact growth.
 */
export async function buildReport(organizationId: string, rangeDays = 30) {
  const since = daysAgo(rangeDays);

  const [
    byStatus,
    contactsByChannel,
    campaignAgg,
    contactsTotal,
    contactsInRange,
  ] = await Promise.all([
    prisma.conversation.groupBy({
      by: ["status"],
      where: { organizationId },
      _count: true,
    }),
    prisma.contact.groupBy({
      by: ["channel"],
      where: { organizationId },
      _count: true,
    }),
    prisma.campaign.aggregate({
      where: { organizationId },
      _sum: {
        queuedCount: true,
        sentCount: true,
        deliveredCount: true,
        readCount: true,
        repliedCount: true,
        failedCount: true,
        skippedCount: true,
        convertedCount: true,
      },
    }),
    prisma.contact.count({ where: { organizationId } }),
    prisma.contact.count({
      where: { organizationId, createdAt: { gte: since } },
    }),
  ]);

  const [responseTimes, resolution, workload, templatePerformance, contactGrowth] =
    await Promise.all([
      computeFirstResponseTime(organizationId, since),
      computeResolutionTime(organizationId, since),
      computeAgentWorkload(organizationId, since),
      computeTemplatePerformance(organizationId),
      computeContactGrowth(organizationId, rangeDays),
    ]);

  const open = byStatus
    .filter((row) => row.status !== ConversationStatus.CLOSED)
    .reduce((sum, row) => sum + row._count, 0);
  const closed =
    byStatus.find((row) => row.status === ConversationStatus.CLOSED)?._count ?? 0;

  return {
    rangeDays,
    conversations: {
      open,
      closed,
      byStatus: byStatus.map((row) => ({ status: row.status, count: row._count })),
      byChannel: contactsByChannel.map((row) => ({
        channel: row.channel,
        count: row._count,
      })),
    },
    responseTime: responseTimes,
    resolutionTime: resolution,
    agents: workload,
    campaigns: {
      queued: campaignAgg._sum.queuedCount ?? 0,
      sent: campaignAgg._sum.sentCount ?? 0,
      delivered: campaignAgg._sum.deliveredCount ?? 0,
      read: campaignAgg._sum.readCount ?? 0,
      replied: campaignAgg._sum.repliedCount ?? 0,
      failed: campaignAgg._sum.failedCount ?? 0,
      skipped: campaignAgg._sum.skippedCount ?? 0,
      converted: campaignAgg._sum.convertedCount ?? 0,
      deliveryRate: rate(
        campaignAgg._sum.deliveredCount,
        campaignAgg._sum.sentCount,
      ),
      readRate: rate(campaignAgg._sum.readCount, campaignAgg._sum.deliveredCount),
      replyRate: rate(campaignAgg._sum.repliedCount, campaignAgg._sum.sentCount),
    },
    templates: templatePerformance,
    contacts: {
      total: contactsTotal,
      newInRange: contactsInRange,
      growth: contactGrowth,
    },
  };
}

function rate(numerator?: number | null, denominator?: number | null) {
  if (!denominator || denominator <= 0) return 0;
  return Math.round(((numerator ?? 0) / denominator) * 100);
}

function formatSeconds(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round((seconds / 3600) * 10) / 10}h`;
}

async function computeFirstResponseTime(organizationId: string, since: Date) {
  const conversations = await prisma.conversation.findMany({
    where: { organizationId, createdAt: { gte: since } },
    select: { contactId: true },
    take: 1000,
    orderBy: { createdAt: "desc" },
  });
  const contactIds = conversations.map((c) => c.contactId);
  if (contactIds.length === 0) {
    return { averageSeconds: 0, label: "—", sampleSize: 0 };
  }

  const messages = await prisma.message.findMany({
    where: {
      contactId: { in: contactIds },
      sender: { in: [MessageSender.CUSTOMER, MessageSender.AGENT] },
      isNote: false,
    },
    select: { contactId: true, sender: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const firstCustomer = new Map<string, Date>();
  const firstResponse = new Map<string, number>();
  for (const message of messages) {
    if (message.sender === MessageSender.CUSTOMER) {
      if (!firstCustomer.has(message.contactId)) {
        firstCustomer.set(message.contactId, message.createdAt);
      }
    } else if (message.sender === MessageSender.AGENT) {
      const customerAt = firstCustomer.get(message.contactId);
      if (customerAt && !firstResponse.has(message.contactId)) {
        const diff = (message.createdAt.getTime() - customerAt.getTime()) / 1000;
        if (diff >= 0) firstResponse.set(message.contactId, diff);
      }
    }
  }

  const values = Array.from(firstResponse.values());
  if (values.length === 0) {
    return { averageSeconds: 0, label: "—", sampleSize: 0 };
  }
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return {
    averageSeconds: Math.round(avg),
    label: formatSeconds(avg),
    sampleSize: values.length,
  };
}

async function computeResolutionTime(organizationId: string, since: Date) {
  const closed = await prisma.conversation.findMany({
    where: {
      organizationId,
      status: ConversationStatus.CLOSED,
      closedAt: { not: null, gte: since },
    },
    select: { createdAt: true, closedAt: true },
    take: 2000,
  });
  if (closed.length === 0) {
    return { averageSeconds: 0, label: "—", sampleSize: 0 };
  }
  const durations = closed
    .map((c) => ((c.closedAt as Date).getTime() - c.createdAt.getTime()) / 1000)
    .filter((d) => d >= 0);
  const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
  return {
    averageSeconds: Math.round(avg),
    label: formatSeconds(avg),
    sampleSize: durations.length,
  };
}

async function computeAgentWorkload(organizationId: string, since: Date) {
  const [messageCounts, assignedCounts] = await Promise.all([
    prisma.message.groupBy({
      by: ["senderId"],
      where: {
        organizationId,
        sender: MessageSender.AGENT,
        senderId: { not: null },
        createdAt: { gte: since },
      },
      _count: true,
    }),
    prisma.conversation.groupBy({
      by: ["assignedAgentId"],
      where: { organizationId, assignedAgentId: { not: null } },
      _count: true,
    }),
  ]);

  const agentIds = Array.from(
    new Set([
      ...messageCounts.map((m) => m.senderId).filter(Boolean),
      ...assignedCounts.map((a) => a.assignedAgentId).filter(Boolean),
    ]),
  ) as string[];

  const users = await prisma.user.findMany({
    where: { id: { in: agentIds } },
    select: { id: true, name: true, email: true, availability: true },
  });

  return users
    .map((user) => ({
      agent: user,
      messagesSent:
        messageCounts.find((m) => m.senderId === user.id)?._count ?? 0,
      assignedConversations:
        assignedCounts.find((a) => a.assignedAgentId === user.id)?._count ?? 0,
    }))
    .sort((a, b) => b.messagesSent - a.messagesSent);
}

async function computeTemplatePerformance(organizationId: string) {
  const campaigns = await prisma.campaign.groupBy({
    by: ["templateName"],
    where: { organizationId, templateName: { not: null } },
    _sum: {
      sentCount: true,
      deliveredCount: true,
      readCount: true,
      repliedCount: true,
      failedCount: true,
    },
  });

  return campaigns
    .map((row) => ({
      template: row.templateName,
      sent: row._sum.sentCount ?? 0,
      delivered: row._sum.deliveredCount ?? 0,
      read: row._sum.readCount ?? 0,
      replied: row._sum.repliedCount ?? 0,
      failed: row._sum.failedCount ?? 0,
      deliveryRate: rate(row._sum.deliveredCount, row._sum.sentCount),
      readRate: rate(row._sum.readCount, row._sum.deliveredCount),
      replyRate: rate(row._sum.repliedCount, row._sum.sentCount),
    }))
    .sort((a, b) => b.sent - a.sent);
}

async function computeContactGrowth(organizationId: string, rangeDays: number) {
  const since = daysAgo(rangeDays);
  const contacts = await prisma.contact.findMany({
    where: { organizationId, createdAt: { gte: since } },
    select: { createdAt: true },
  });

  const byDay = new Map<string, number>();
  for (const contact of contacts) {
    const key = contact.createdAt.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }

  const series: { date: string; count: number }[] = [];
  for (let i = rangeDays - 1; i >= 0; i -= 1) {
    const date = daysAgo(i).toISOString().slice(0, 10);
    series.push({ date, count: byDay.get(date) ?? 0 });
  }
  return series;
}
