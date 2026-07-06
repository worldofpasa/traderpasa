import { describe, expect, it } from "vitest";
import {
  createCsrfToken,
  createSessionToken,
  CsrfValidationError,
  hashCsrfToken,
  hashPassword,
  hashSessionToken,
  validateCsrfTokenForSession,
  verifyPassword,
} from "./auth.js";

interface CsrfSessionQuery {
  where: {
    tokenHash: string;
    revokedAt: null;
    expiresAt: {
      gt: Date;
    };
  };
  select: {
    csrfTokenHash: true;
  };
}

describe("password hashing", () => {
  it("uses a one-way Argon2id hash", async () => {
    const password = "correct horse battery staple";
    const passwordHash = await hashPassword(password);

    expect(passwordHash).not.toBe(password);
    expect(passwordHash).toContain("argon2id");
    await expect(verifyPassword(passwordHash, password)).resolves.toBe(true);
    await expect(verifyPassword(passwordHash, "wrong password")).resolves.toBe(false);
  });
});

describe("session tokens", () => {
  it("stores deterministic token hashes instead of raw session tokens", () => {
    const sessionToken = createSessionToken();
    const tokenHash = hashSessionToken(sessionToken);

    expect(sessionToken).toHaveLength(43);
    expect(tokenHash).not.toBe(sessionToken);
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(hashSessionToken(sessionToken)).toBe(tokenHash);
  });
});

describe("csrf tokens", () => {
  it("stores deterministic token hashes instead of raw CSRF tokens", () => {
    const csrfToken = createCsrfToken();
    const tokenHash = hashCsrfToken(csrfToken);

    expect(csrfToken).toHaveLength(43);
    expect(tokenHash).not.toBe(csrfToken);
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(hashCsrfToken(csrfToken)).toBe(tokenHash);
  });

  it("validates session-bound CSRF token hashes", async () => {
    const sessionToken = createSessionToken();
    const csrfToken = createCsrfToken();
    const db = {
      session: {
        findFirst: (input: unknown) => {
          const query = input as CsrfSessionQuery;

          expect(query.where.expiresAt.gt).toBeInstanceOf(Date);
          expect(input).toEqual({
            where: {
              tokenHash: hashSessionToken(sessionToken),
              revokedAt: null,
              expiresAt: {
                gt: query.where.expiresAt.gt,
              },
            },
            select: {
              csrfTokenHash: true,
            },
          });

          return Promise.resolve({
            csrfTokenHash: hashCsrfToken(csrfToken),
          });
        },
      },
    };

    await expect(
      validateCsrfTokenForSession(
        {
          csrfToken,
          sessionToken,
        },
        db as never,
      ),
    ).resolves.toBeUndefined();
  });

  it("rejects missing or mismatched CSRF tokens", async () => {
    const db = {
      session: {
        findFirst: () =>
          Promise.resolve({
            csrfTokenHash: hashCsrfToken(createCsrfToken()),
          }),
      },
    };

    await expect(
      validateCsrfTokenForSession(
        {
          csrfToken: undefined,
          sessionToken: createSessionToken(),
        },
        db as never,
      ),
    ).rejects.toBeInstanceOf(CsrfValidationError);

    await expect(
      validateCsrfTokenForSession(
        {
          csrfToken: createCsrfToken(),
          sessionToken: createSessionToken(),
        },
        db as never,
      ),
    ).rejects.toBeInstanceOf(CsrfValidationError);
  });
});
