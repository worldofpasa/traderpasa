import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { assertRequiredEnv } from "./env";

const VALID_KEY = Buffer.alloc(32).toString("base64");

function withEnv(overrides: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};

  for (const key of Object.keys(overrides)) {
    saved[key] = process.env[key];
    if (overrides[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = overrides[key];
    }
  }

  try {
    fn();
  } finally {
    for (const key of Object.keys(saved)) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  }
}

describe("assertRequiredEnv", () => {
  it("passes when all required vars are present and valid", () => {
    withEnv(
      {
        DATABASE_URL: "postgres://localhost/test",
        CREDENTIAL_ENCRYPTION_KEY: VALID_KEY,
      },
      () => {
        expect(() => assertRequiredEnv()).not.toThrow();
      },
    );
  });

  it("throws listing DATABASE_URL when missing", () => {
    withEnv(
      {
        DATABASE_URL: undefined,
        CREDENTIAL_ENCRYPTION_KEY: VALID_KEY,
      },
      () => {
        expect(() => assertRequiredEnv()).toThrow(/DATABASE_URL/);
      },
    );
  });

  it("throws listing CREDENTIAL_ENCRYPTION_KEY when missing", () => {
    withEnv(
      {
        DATABASE_URL: "postgres://localhost/test",
        CREDENTIAL_ENCRYPTION_KEY: undefined,
      },
      () => {
        expect(() => assertRequiredEnv()).toThrow(/CREDENTIAL_ENCRYPTION_KEY/);
      },
    );
  });

  it("lists all missing vars in one error", () => {
    withEnv(
      {
        DATABASE_URL: undefined,
        CREDENTIAL_ENCRYPTION_KEY: undefined,
      },
      () => {
        expect(() => assertRequiredEnv()).toThrow(/DATABASE_URL.*CREDENTIAL_ENCRYPTION_KEY/);
      },
    );
  });

  it("throws when CREDENTIAL_ENCRYPTION_KEY is not 32 bytes", () => {
    withEnv(
      {
        DATABASE_URL: "postgres://localhost/test",
        CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64"),
      },
      () => {
        expect(() => assertRequiredEnv()).toThrow(/32-byte/);
      },
    );
  });
});
