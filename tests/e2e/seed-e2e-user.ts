import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const DEFAULT_EMAIL = "e2e-admin@pasa.local";
const DEFAULT_PASSWORD = "e2e-test-password-12";

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

async function main(): Promise<void> {
  process.env.DATABASE_URL ??= "postgres://pasatrader:pasatrader@127.0.0.1:55432/pasatrader";

  const email = process.env.E2E_EMAIL ?? DEFAULT_EMAIL;
  const password = process.env.E2E_PASSWORD ?? DEFAULT_PASSWORD;

  const db = new PrismaClient({
    adapter: new PrismaPg(process.env.DATABASE_URL),
  });

  try {
    const adminCount = await db.user.count({ where: { role: "ADMIN" } });
    const passwordHash = await hashPassword(password);

    if (adminCount === 0) {
      await db.user.create({
        data: {
          name: "E2E Admin",
          email,
          passwordHash,
          role: "ADMIN",
        },
      });
      return;
    }

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      await db.user.update({
        where: { email },
        data: { passwordHash },
      });
      return;
    }

    await db.user.create({
      data: {
        name: "E2E Admin",
        email,
        passwordHash,
        role: "ADMIN",
      },
    });
  } finally {
    await db.$disconnect();
  }
}

void main();
