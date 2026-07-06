import { describe, it, expect, vi } from "vitest";
import { setLiveAccessPin, verifyLiveAccessPin, userHasLiveAccessPin, LivePinError } from "./live-pin.js";
import { hashPassword } from "./auth.js";

process.env.CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32).toString("base64");

function makeDbMock(user: Record<string, unknown> | null) {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue(user),
      update: vi.fn().mockResolvedValue({}),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  } as any;
}

describe("setLiveAccessPin", () => {
  it("rejects PINs shorter than 6 characters", async () => {
    const dbMock = makeDbMock({ liveAccessPinHash: null });
    await expect(setLiveAccessPin("user-1", "12345", undefined, dbMock)).rejects.toThrow(LivePinError);
    expect(dbMock.user.update).not.toHaveBeenCalled();
  });

  it("sets a new PIN as an argon2 hash and writes an audit record", async () => {
    const dbMock = makeDbMock({ liveAccessPinHash: null });

    await setLiveAccessPin("user-1", "secret-pin", undefined, dbMock);

    const update = dbMock.user.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: "user-1" });
    expect(update.data.liveAccessPinHash).toMatch(/^\$argon2/);
    expect(update.data.liveAccessPinHash).not.toContain("secret-pin");
    expect(dbMock.auditLog.create.mock.calls[0][0].data.action).toBe("auth.live_pin_configured");
  });

  it("requires the current PIN to change an existing one", async () => {
    const existingHash = await hashPassword("old-pin-123");
    const dbMock = makeDbMock({ liveAccessPinHash: existingHash });

    await expect(setLiveAccessPin("user-1", "new-pin-456", undefined, dbMock)).rejects.toMatchObject({
      code: "invalid_current_pin",
    });
    await expect(setLiveAccessPin("user-1", "new-pin-456", "wrong", dbMock)).rejects.toMatchObject({
      code: "invalid_current_pin",
    });

    await setLiveAccessPin("user-1", "new-pin-456", "old-pin-123", dbMock);
    expect(dbMock.auditLog.create.mock.calls[0][0].data.action).toBe("auth.live_pin_changed");
  });
});

describe("verifyLiveAccessPin", () => {
  it("returns true for the correct PIN", async () => {
    const hash = await hashPassword("correct-pin");
    const dbMock = makeDbMock({ liveAccessPinHash: hash });

    expect(await verifyLiveAccessPin("user-1", "correct-pin", dbMock)).toBe(true);
    expect(dbMock.auditLog.create).not.toHaveBeenCalled();
  });

  it("returns false and audits on a wrong PIN", async () => {
    const hash = await hashPassword("correct-pin");
    const dbMock = makeDbMock({ liveAccessPinHash: hash });

    expect(await verifyLiveAccessPin("user-1", "wrong-pin", dbMock)).toBe(false);
    expect(dbMock.auditLog.create.mock.calls[0][0].data.action).toBe("auth.live_pin_verification_failed");
  });

  it("returns false when no PIN is configured", async () => {
    const dbMock = makeDbMock({ liveAccessPinHash: null });
    expect(await verifyLiveAccessPin("user-1", "anything", dbMock)).toBe(false);
  });
});

describe("userHasLiveAccessPin", () => {
  it("reflects whether a hash is stored", async () => {
    expect(await userHasLiveAccessPin("user-1", makeDbMock({ liveAccessPinHash: "x" }))).toBe(true);
    expect(await userHasLiveAccessPin("user-1", makeDbMock({ liveAccessPinHash: null }))).toBe(false);
    expect(await userHasLiveAccessPin("user-1", makeDbMock(null))).toBe(false);
  });
});
