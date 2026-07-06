import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CredentialEncryptionKeyError,
  decryptCredentialSecret,
  encryptCredentialSecret,
  parseCredentialEncryptionKey,
} from "./credentials.js";

describe("credential encryption", () => {
  it("encrypts secrets with AES-256-GCM without storing plaintext", () => {
    const secret = "alpaca-secret-key";
    const key = randomBytes(32);
    const encrypted = encryptCredentialSecret(secret, key);

    expect(encrypted.encryptedPayload).not.toBe(secret);
    expect(encrypted.iv).toHaveLength(16);
    expect(encrypted.authTag).toHaveLength(24);
    expect(decryptCredentialSecret(encrypted, key)).toBe(secret);
  });

  it("requires a 32-byte base64 deployment key", () => {
    const key = randomBytes(32);

    expect(parseCredentialEncryptionKey(key.toString("base64"))).toEqual(key);
    expect(() => parseCredentialEncryptionKey(undefined)).toThrow(CredentialEncryptionKeyError);
    expect(() => parseCredentialEncryptionKey("not-valid")).toThrow(CredentialEncryptionKeyError);
  });
});
