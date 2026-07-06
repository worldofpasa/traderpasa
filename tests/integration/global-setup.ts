import { execSync } from "node:child_process";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { BASE_DATABASE_URL, integrationDatabaseName, integrationDatabaseUrl } from "./test-db.js";

export default async function globalSetup(): Promise<void> {
  process.env.CREDENTIAL_ENCRYPTION_KEY ??= Buffer.alloc(32).toString("base64");

  const testDbName = integrationDatabaseName();

  // Create the test database if it does not exist, using the base database connection.
  const admin = new PrismaClient({ adapter: new PrismaPg(BASE_DATABASE_URL) });
  try {
    const rows = await admin.$queryRawUnsafe<unknown[]>(
      `SELECT 1 FROM pg_database WHERE datname = '${testDbName.replaceAll("'", "''")}'`,
    );
    if (rows.length === 0) {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${testDbName.replaceAll('"', '""')}"`);
    }
  } finally {
    await admin.$disconnect();
  }

  // Apply all Prisma migrations to the test database.
  execSync("pnpm --filter @pasa-trader/db exec prisma migrate deploy", {
    stdio: "inherit",
    cwd: path.join(__dirname, "../.."),
    env: { ...process.env, DATABASE_URL: integrationDatabaseUrl() },
  });
}
