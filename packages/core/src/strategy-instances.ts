import { getPrismaClient, Prisma, type PrismaClient, type StrategyInstance } from "@pasa-trader/db";
import { updateStrategyInstanceRequestSchema, type UpdateStrategyInstanceRequest } from "@pasa-trader/schemas";

export type { StrategyInstance };

export class StrategyTemplateNotFoundError extends Error {
  constructor(templateId: string) {
    super(`Strategy template not found: ${templateId}`);
    this.name = "StrategyTemplateNotFoundError";
  }
}

export class StrategyInstanceNotFoundError extends Error {
  constructor() {
    super("Strategy instance not found.");
    this.name = "StrategyInstanceNotFoundError";
  }
}

export class StrategyTemplateImmutableError extends Error {
  constructor() {
    super("Base strategy templates cannot be edited.");
    this.name = "StrategyTemplateImmutableError";
  }
}

export interface ForkStrategyTemplateInput {
  userId: string;
  templateId: string;
  name?: string;
}

export async function forkStrategyTemplate(
  input: ForkStrategyTemplateInput,
  db: PrismaClient = getPrismaClient(),
): Promise<StrategyInstance> {
  const template = await db.strategyTemplate.findUnique({
    where: { id: input.templateId },
  });

  if (!template) {
    throw new StrategyTemplateNotFoundError(input.templateId);
  }

  const defaultConfig = template.defaultConfig as Record<string, unknown>;

  const instance = await db.$transaction(async (tx) => {
    const created = await tx.strategyInstance.create({
      data: {
        userId: input.userId,
        templateId: template.id,
        name: input.name ?? `${template.name} (copy)`,
        status: "DISABLED",
        watchlistMode: (defaultConfig.watchlistMode as "MANUAL" | "DYNAMIC") ?? "MANUAL",
        outputMode: (defaultConfig.outputMode as "PROPOSED_ORDERS" | "RANKED_IDEAS") ?? "PROPOSED_ORDERS",
        executionMode: (defaultConfig.executionMode as "PAPER" | "LIVE") ?? "PAPER",
        modelLoggingDepth: (defaultConfig.modelLoggingDepth as "METADATA" | "FULL") ?? "METADATA",
        sourceConfig: (defaultConfig.sourceConfig as object) ?? {},
        riskConfig: (defaultConfig.riskConfig as object) ?? {},
        marketSessionRules: (defaultConfig.marketSessionRules as object) ?? {},
      },
    });

    await tx.auditLog.create({
      data: {
        actorType: "USER",
        actorId: input.userId,
        action: "strategy.forked",
        target: `strategyInstance:${created.id}`,
        metadata: {
          templateId: template.id,
          templateKind: template.kind,
          name: created.name,
        },
      },
    });

    return created;
  });

  return instance;
}

export async function updateStrategyInstance(
  id: string,
  userId: string,
  input: UpdateStrategyInstanceRequest,
  db: PrismaClient = getPrismaClient(),
): Promise<StrategyInstance> {
  const parsed = updateStrategyInstanceRequestSchema.parse(input);

  const existing = await db.strategyInstance.findFirst({
    where: { id, userId, status: { not: "DELETED" } },
  });

  if (!existing) {
    throw new StrategyInstanceNotFoundError();
  }

  const updated = await db.$transaction(async (tx) => {
    const data: Prisma.StrategyInstanceUpdateInput = {};

    if (parsed.name !== undefined) data.name = parsed.name;
    if (parsed.description !== undefined) data.description = parsed.description;
    if ("brokerAccountId" in parsed) data.brokerAccount = parsed.brokerAccountId
      ? { connect: { id: parsed.brokerAccountId } }
      : { disconnect: true };
    if (parsed.watchlistMode !== undefined) data.watchlistMode = parsed.watchlistMode;
    if (parsed.symbols !== undefined) data.symbols = parsed.symbols;
    if (parsed.sourceConfig !== undefined) data.sourceConfig = parsed.sourceConfig as Prisma.InputJsonObject;
    if (parsed.riskConfig !== undefined) data.riskConfig = parsed.riskConfig as Prisma.InputJsonObject;
    if (parsed.outputMode !== undefined) data.outputMode = parsed.outputMode;
    if (parsed.executionMode !== undefined) data.executionMode = parsed.executionMode;
    if (parsed.marketSessionRules !== undefined) data.marketSessionRules = parsed.marketSessionRules as Prisma.InputJsonObject;
    if ("scheduleConfig" in parsed) {
      data.scheduleConfig = parsed.scheduleConfig !== null && parsed.scheduleConfig !== undefined
        ? parsed.scheduleConfig as Prisma.InputJsonObject
        : Prisma.DbNull;
    }
    if ("trailingStopConfig" in parsed) {
      data.trailingStopConfig = parsed.trailingStopConfig !== null && parsed.trailingStopConfig !== undefined
        ? parsed.trailingStopConfig as Prisma.InputJsonObject
        : Prisma.DbNull;
    }
    if (parsed.modelLoggingDepth !== undefined) data.modelLoggingDepth = parsed.modelLoggingDepth;
    if (parsed.stepModelConfig !== undefined) data.stepModelConfig = parsed.stepModelConfig as Prisma.InputJsonObject;
    if (parsed.agentTeamConfig !== undefined) data.agentTeamConfig = parsed.agentTeamConfig as Prisma.InputJsonObject;

    const result = await tx.strategyInstance.update({
      where: { id },
      data,
    });

    await tx.auditLog.create({
      data: {
        actorType: "USER",
        actorId: userId,
        action: "strategy.updated",
        target: `strategyInstance:${id}`,
        metadata: { fields: Object.keys(parsed) } as Prisma.InputJsonObject,
      },
    });

    return result;
  });

  return updated;
}

export class StrategyInstanceDeletedError extends Error {
  constructor() {
    super("Strategy instance has already been deleted.");
    this.name = "StrategyInstanceDeletedError";
  }
}

async function transitionInstanceStatus(
  id: string,
  userId: string,
  targetStatus: "ENABLED" | "DISABLED" | "DELETED",
  auditAction: string,
  db: PrismaClient,
): Promise<StrategyInstance> {
  const existing = await db.strategyInstance.findFirst({
    where: { id, userId },
  });

  if (!existing) {
    throw new StrategyInstanceNotFoundError();
  }

  if (existing.status === "DELETED") {
    throw new StrategyInstanceDeletedError();
  }

  return db.$transaction(async (tx) => {
    const updated = await tx.strategyInstance.update({
      where: { id },
      data: { status: targetStatus },
    });

    await tx.auditLog.create({
      data: {
        actorType: "USER",
        actorId: userId,
        action: auditAction,
        target: `strategyInstance:${id}`,
        metadata: {
          previousStatus: existing.status,
          newStatus: targetStatus,
        } as Prisma.InputJsonObject,
      },
    });

    return updated;
  });
}

export function enableStrategyInstance(
  id: string,
  userId: string,
  db: PrismaClient = getPrismaClient(),
): Promise<StrategyInstance> {
  return transitionInstanceStatus(id, userId, "ENABLED", "strategy.enabled", db);
}

export function disableStrategyInstance(
  id: string,
  userId: string,
  db: PrismaClient = getPrismaClient(),
): Promise<StrategyInstance> {
  return transitionInstanceStatus(id, userId, "DISABLED", "strategy.disabled", db);
}

export function deleteStrategyInstance(
  id: string,
  userId: string,
  db: PrismaClient = getPrismaClient(),
): Promise<StrategyInstance> {
  return transitionInstanceStatus(id, userId, "DELETED", "strategy.deleted", db);
}

export async function listStrategyInstancesForUser(
  userId: string,
  db: PrismaClient = getPrismaClient(),
): Promise<StrategyInstance[]> {
  return db.strategyInstance.findMany({
    where: {
      userId,
      status: { not: "DELETED" },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getStrategyInstanceForUser(
  id: string,
  userId: string,
  db: PrismaClient = getPrismaClient(),
): Promise<StrategyInstance> {
  const instance = await db.strategyInstance.findFirst({
    where: { id, userId, status: { not: "DELETED" } },
  });

  if (!instance) {
    throw new StrategyInstanceNotFoundError();
  }

  return instance;
}
