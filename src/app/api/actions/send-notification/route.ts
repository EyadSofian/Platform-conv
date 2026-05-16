import { NotificationType, Prisma } from "@prisma/client";
import { created, handleRouteError, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { emitRealtime } from "@/lib/realtime";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await readJson<Record<string, unknown>>(request);
    const userId = body.userId as string | undefined;
    if (!userId) throw new Error("userId is required.");

    const notification = await prisma.notification.create({
      data: {
        userId,
        type: String(body.type ?? "FOLLOW_UP").toUpperCase() as NotificationType,
        title: String(body.title ?? "AI action"),
        body: String(body.body ?? "BotPress sent a notification."),
        metadata: (body.metadata ?? {}) as Prisma.InputJsonObject,
      },
    });

    await emitRealtime({
      type: "notification.created",
      room: `agent:${userId}`,
      payload: notification,
    });

    return created(notification);
  } catch (error) {
    return handleRouteError(error);
  }
}
