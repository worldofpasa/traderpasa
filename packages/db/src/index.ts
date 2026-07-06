import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

declare global {
  var pasaTraderPrisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to initialize the Prisma client.");
  }

  return new PrismaClient({
    adapter: new PrismaPg(databaseUrl),
  });
}

export function getPrismaClient(): PrismaClient {
  globalThis.pasaTraderPrisma ??= createPrismaClient();

  return globalThis.pasaTraderPrisma;
}

export { Prisma } from "@prisma/client";
export { seedBuiltinAgentTemplates, type BuiltinAgentSeedResult } from "./seed-builtin-agent-templates.js";

export type {
  AgentTemplate,
  AgentStep,
  AgentStepPhase,
  AgentStepStatus,
  AuditActorType,
  AuditLog,
  BrokerAccount,
  BrokerAccountStatus,
  BrokerEnvironment,
  Credential,
  EvidenceBundle,
  EvidenceBundleStatus,
  EvidenceItem,
  EvidenceItemStatus,
  ExecutionMode,
  JobRun,
  JobRunStatus,
  ModelLoggingDepth,
  Notification,
  NotificationKind,
  NotificationSeverity,
  OrderRecord,
  OrderRecordStatus,
  OrderSide,
  OrderType,
  OutputMode,
  PacketStatus,
  PrismaClient,
  ProposedOrder,
  ProposedOrderPacket,
  ProposedOrderStatus,
  Session,
  SourceReliabilityClass,
  StrategyInstance,
  StrategyInstanceStatus,
  StrategyKind,
  StrategyTemplate,
  User,
  UserRole,
  WatchlistMode,
} from "@prisma/client";
