import { MessageSender } from "@prisma/client";
import { handleRouteError, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

export async function GET() {
  try {
    const today = daysAgo(1);
    const week = daysAgo(7);
    const month = daysAgo(30);

    const [
      todayConversations,
      weekConversations,
      monthConversations,
      byStatus,
      byChannel,
      campaignStats,
      agentMessages,
      totalMessages,
      botMessages,
      agentMessagesTotal,
    ] = await Promise.all([
      prisma.conversation.count({ where: { createdAt: { gte: today } } }),
      prisma.conversation.count({ where: { createdAt: { gte: week } } }),
      prisma.conversation.count({ where: { createdAt: { gte: month } } }),
      prisma.conversation.groupBy({ by: ["status"], _count: true }),
      prisma.contact.groupBy({ by: ["channel"], _count: true }),
      prisma.campaign.aggregate({
        _sum: {
          sentCount: true,
          deliveredCount: true,
          repliedCount: true,
          convertedCount: true,
        },
      }),
      prisma.message.groupBy({
        by: ["senderId"],
        where: { sender: MessageSender.AGENT, senderId: { not: null } },
        _count: true,
      }),
      prisma.message.count({ where: { createdAt: { gte: month } } }),
      prisma.message.count({
        where: { sender: MessageSender.BOT, createdAt: { gte: month } },
      }),
      prisma.message.count({
        where: { sender: MessageSender.AGENT, createdAt: { gte: month } },
      }),
    ]);

    const users = await prisma.user.findMany({
      where: { id: { in: agentMessages.map((item) => item.senderId ?? "") } },
      select: { id: true, name: true, email: true },
    });

    return ok({
      conversations: {
        today: todayConversations,
        week: weekConversations,
        month: monthConversations,
        byStatus,
        byChannel,
      },
      botHandlingRate:
        totalMessages > 0 ? Math.round((botMessages / totalMessages) * 100) : 0,
      humanHandlingRate:
        totalMessages > 0
          ? Math.round((agentMessagesTotal / totalMessages) * 100)
          : 0,
      campaigns: campaignStats._sum,
      agents: agentMessages.map((item) => ({
        agent: users.find((user) => user.id === item.senderId),
        messagesSent: item._count,
      })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
