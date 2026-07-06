import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

export const BASE_DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://pasatrader:pasatrader@127.0.0.1:55432/pasatrader";

/** Derive the dedicated integration database URL (suffix `_test`). */
export function integrationDatabaseUrl(): string {
  if (process.env.INTEGRATION_DATABASE_URL) return process.env.INTEGRATION_DATABASE_URL;
  const url = new URL(BASE_DATABASE_URL);
  url.pathname = `${url.pathname}_test`;
  return url.toString();
}

export function integrationDatabaseName(): string {
  return new URL(integrationDatabaseUrl()).pathname.slice(1);
}

export function makeTestDb(): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg(integrationDatabaseUrl()) });
}

/** Wipe all application tables between tests. */
export async function resetDb(db: PrismaClient): Promise<void> {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "Notification","AuditLog","OrderRecord","ProposedOrder","ProposedOrderPacket","EvidenceItem","EvidenceBundle","AgentStep","JobRun","StrategyInstance","StrategyTemplate","BrokerAccount","Credential","Session","AgentTemplate","User" RESTART IDENTITY CASCADE',
  );
}
