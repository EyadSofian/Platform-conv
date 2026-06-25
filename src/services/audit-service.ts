import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { recordAudit, type AuditEvent } from "../lib/logger";

/**
 * Records a sensitive action both to the structured console log and to the
 * persistent `AuditLog` table. DB persistence is best-effort and never throws
 * into the caller's request path.
 */
export async function writeAudit(
  event: AuditEvent | string,
  input: {
    organizationId?: string | null;
    actorId?: string | null;
    targetType?: string | null;
    targetId?: string | null;
    metadata?: Record<string, unknown>;
  } = {},
) {
  recordAudit(event as AuditEvent, input.actorId ?? null, {
    organizationId: input.organizationId,
    targetType: input.targetType,
    targetId: input.targetId,
    ...(input.metadata ?? {}),
  });

  try {
    await prisma.auditLog.create({
      data: {
        event: String(event),
        organizationId: input.organizationId ?? null,
        actorId: input.actorId ?? null,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  } catch {
    // Auditing must never break the originating request.
  }
}

export async function listAuditLogs(organizationId: string, limit = 100) {
  return prisma.auditLog.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 500),
  });
}
