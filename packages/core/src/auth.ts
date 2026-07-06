import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import argon2 from "argon2";
import { getPrismaClient, seedBuiltinAgentTemplates, type Prisma, type PrismaClient } from "@pasa-trader/db";
import {
  currentUserResponseSchema,
  logoutResponseSchema,
  signInRequestSchema,
  signInResponseSchema,
  setupFirstAdminRequestSchema,
  setupFirstAdminResponseSchema,
  setupStatusResponseSchema,
  type AuthUser,
  type CurrentUserResponse,
  type LogoutResponse,
  type SignInRequest,
  type SignInResponse,
  type SetupFirstAdminRequest,
  type SetupFirstAdminResponse,
  type SetupStatusResponse,
} from "@pasa-trader/schemas";

export { csrfCookieName, csrfHeaderName, sessionCookieName } from "@pasa-trader/schemas";

const sessionDurationMs = 1000 * 60 * 60 * 24 * 30;

export class FirstAdminAlreadyExistsError extends Error {
  constructor() {
    super("First local admin setup is already complete.");
    this.name = "FirstAdminAlreadyExistsError";
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Invalid email or password.");
    this.name = "InvalidCredentialsError";
  }
}

export class CsrfValidationError extends Error {
  constructor() {
    super("A valid CSRF token is required.");
    this.name = "CsrfValidationError";
  }
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
  });
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return argon2.verify(passwordHash, password);
}

export function hashSessionToken(sessionToken: string): string {
  return createHash("sha256").update(sessionToken).digest("hex");
}

export function hashCsrfToken(csrfToken: string): string {
  return createHash("sha256").update(csrfToken).digest("hex");
}

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function createCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function toAuthUser(user: AuthUser): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

export async function getSetupStatus(
  db: PrismaClient = getPrismaClient(),
): Promise<SetupStatusResponse> {
  const adminCount = await db.user.count({
    where: {
      role: "ADMIN",
    },
  });

  return setupStatusResponseSchema.parse({
    needsFirstAdmin: adminCount === 0,
  });
}

export async function createFirstAdminAccount(
  input: SetupFirstAdminRequest,
  db: PrismaClient = getPrismaClient(),
): Promise<SetupFirstAdminResponse> {
  const parsedInput = setupFirstAdminRequestSchema.parse(input);
  const passwordHash = await hashPassword(parsedInput.password);

  const user = await db.$transaction(
    async (transaction) => {
      const adminCount = await transaction.user.count({
        where: {
          role: "ADMIN",
        },
      });

      if (adminCount > 0) {
        throw new FirstAdminAlreadyExistsError();
      }

      const createdUser = await transaction.user.create({
        data: {
          name: parsedInput.name,
          email: parsedInput.email,
          passwordHash,
          role: "ADMIN",
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      });

      await transaction.auditLog.create({
        data: {
          actorType: "USER",
          actorId: createdUser.id,
          action: "auth.first_admin_created",
          target: `user:${createdUser.id}`,
          metadata: {
            email: createdUser.email,
          },
        },
      });

      return createdUser;
    },
    {
      isolationLevel: "Serializable" satisfies Prisma.TransactionIsolationLevel,
    },
  );

  await seedBuiltinAgentTemplates(db);

  return setupFirstAdminResponseSchema.parse({
    user,
  });
}

export async function signInWithPassword(
  input: SignInRequest,
  db: PrismaClient = getPrismaClient(),
): Promise<SignInResponse & { csrfToken: string; sessionToken: string }> {
  const parsedInput = signInRequestSchema.parse(input);
  const user = await db.user.findUnique({
    where: {
      email: parsedInput.email,
    },
    select: {
      id: true,
      name: true,
      email: true,
      passwordHash: true,
      role: true,
    },
  });

  if (!user) {
    throw new InvalidCredentialsError();
  }

  const passwordMatches = await verifyPassword(user.passwordHash, parsedInput.password);

  if (!passwordMatches) {
    await db.auditLog.create({
      data: {
        actorType: "SYSTEM",
        action: "auth.login_failed",
        target: `user:${user.id}`,
        metadata: {
          email: user.email,
          reason: "invalid_password",
        },
      },
    });
    throw new InvalidCredentialsError();
  }

  const sessionToken = createSessionToken();
  const csrfToken = createCsrfToken();
  const expiresAt = new Date(Date.now() + sessionDurationMs);
  const authUser = toAuthUser(user);

  const session = await db.session.create({
    data: {
      tokenHash: hashSessionToken(sessionToken),
      csrfTokenHash: hashCsrfToken(csrfToken),
      userId: user.id,
      expiresAt,
    },
    select: {
      expiresAt: true,
    },
  });

  await db.auditLog.create({
    data: {
      actorType: "USER",
      actorId: user.id,
      action: "auth.login_succeeded",
      target: `user:${user.id}`,
      metadata: {
        email: user.email,
      },
    },
  });

  return {
    ...signInResponseSchema.parse({
      user: authUser,
      expiresAt: session.expiresAt.toISOString(),
    }),
    csrfToken,
    sessionToken,
  };
}

export async function validateCsrfTokenForSession(
  input: {
    csrfToken: string | undefined;
    sessionToken: string | undefined;
  },
  db: PrismaClient = getPrismaClient(),
): Promise<void> {
  if (!input.csrfToken || !input.sessionToken) {
    throw new CsrfValidationError();
  }

  const session = await db.session.findFirst({
    where: {
      tokenHash: hashSessionToken(input.sessionToken),
      revokedAt: null,
      expiresAt: {
        gt: new Date(),
      },
    },
    select: {
      csrfTokenHash: true,
    },
  });

  if (!session?.csrfTokenHash) {
    throw new CsrfValidationError();
  }

  if (!safeEqual(hashCsrfToken(input.csrfToken), session.csrfTokenHash)) {
    throw new CsrfValidationError();
  }
}

export async function getCurrentUserFromSessionToken(
  sessionToken: string | undefined,
  db: PrismaClient = getPrismaClient(),
): Promise<CurrentUserResponse> {
  if (!sessionToken) {
    return currentUserResponseSchema.parse({
      user: null,
    });
  }

  const session = await db.session.findFirst({
    where: {
      tokenHash: hashSessionToken(sessionToken),
      revokedAt: null,
      expiresAt: {
        gt: new Date(),
      },
    },
    select: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
    },
  });

  return currentUserResponseSchema.parse({
    user: session ? toAuthUser(session.user) : null,
  });
}

export async function logoutSession(
  sessionToken: string | undefined,
  db: PrismaClient = getPrismaClient(),
): Promise<LogoutResponse> {
  if (!sessionToken) {
    return logoutResponseSchema.parse({
      ok: true,
    });
  }

  const tokenHash = hashSessionToken(sessionToken);
  const session = await db.session.findUnique({
    where: {
      tokenHash,
    },
    select: {
      id: true,
      userId: true,
      revokedAt: true,
    },
  });

  if (session && !session.revokedAt) {
    await db.$transaction([
      db.session.update({
        where: {
          id: session.id,
        },
        data: {
          revokedAt: new Date(),
        },
      }),
      db.auditLog.create({
        data: {
          actorType: "USER",
          actorId: session.userId,
          action: "auth.logout",
          target: `session:${session.id}`,
        },
      }),
    ]);
  }

  return logoutResponseSchema.parse({
    ok: true,
  });
}
