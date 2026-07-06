import { getPrismaClient, Prisma, type PrismaClient } from "@pasa-trader/db";
import {
  listAuditLogsResponseSchema,
  type AuditActorType,
  type ListAuditLogsResponse,
} from "@pasa-trader/schemas";

export interface WriteAuditLogInput {
  actorType: AuditActorType;
  actorId?: string;
  action: string;
  target: string;
  metadata?: Record<string, unknown>;
}

export async function writeAuditLog(
  input: WriteAuditLogInput,
  db: PrismaClient = getPrismaClient(),
): Promise<void> {
  await db.auditLog.create({
    data: {
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      action: input.action,
      target: input.target,
      ...(input.metadata !== undefined && { metadata: input.metadata as Prisma.InputJsonObject }),
    },
  });
}

export interface ListAuditLogsInput {
  limit?: number;
  offset?: number;
  action?: string;
}

export async function listAuditLogs(
  input: ListAuditLogsInput = {},
  db: PrismaClient = getPrismaClient(),
): Promise<ListAuditLogsResponse> {
  const limit = Math.min(input.limit ?? 50, 200);
  const offset = input.offset ?? 0;
  const where: Prisma.AuditLogWhereInput = input.action ? { action: input.action } : {};

  const [entries, total] = await db.$transaction([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
      select: {
        id: true,
        actorType: true,
        actorId: true,
        action: true,
        target: true,
        metadata: true,
        createdAt: true,
      },
    }),
    db.auditLog.count({ where }),
  ]);

  return listAuditLogsResponseSchema.parse({
    entries: entries.map((e) => ({
      ...e,
      metadata: e.metadata as Record<string, unknown> | null,
      createdAt: e.createdAt.toISOString(),
    })),
    total,
    limit,
    offset,
  });
}
