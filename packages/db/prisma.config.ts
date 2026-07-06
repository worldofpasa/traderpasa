import { defineConfig } from "prisma/config";

const generateOnlyDatabaseUrl = "postgres://pasatrader:pasatrader@localhost:55432/pasatrader";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? generateOnlyDatabaseUrl,
  },
});
