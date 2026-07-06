import { getPrismaClient, type PrismaClient } from "@pasa-trader/db";
import { hashPassword, verifyPassword } from "./auth.js";

export class LivePinError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "LivePinError";
  }
}

const MIN_PIN_LENGTH = 6;

export async function userHasLiveAccessPin(
  userId: string,
  db: PrismaClient = getPrismaClient(),
): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { liveAccessPinHash: true } });
  return Boolean(user?.liveAccessPinHash);
}

/**
 * Set or change the Live Access PIN (#94). Changing an existing PIN requires
 * the current PIN. The PIN is stored as an argon2id hash, never plaintext.
 */
export async function setLiveAccessPin(
  userId: string,
  pin: string,
  currentPin: string | undefined,
  db: PrismaClient = getPrismaClient(),
): Promise<void> {
  if (typeof pin !== "string" || pin.length < MIN_PIN_LENGTH) {
    throw new LivePinError(`Live Access PIN must be at least ${String(MIN_PIN_LENGTH)} characters.`, "pin_too_short");
  }

  const user = await db.user.findUnique({ where: { id: userId }, select: { liveAccessPinHash: true } });
  if (!user) {
    throw new LivePinError("User not found.", "user_not_found");
  }

  if (user.liveAccessPinHash) {
    const matches = currentPin ? await verifyPassword(user.liveAccessPinHash, currentPin) : false;
    if (!matches) {
      throw new LivePinError("Current Live Access PIN is required to change it.", "invalid_current_pin");
    }
  }

  const liveAccessPinHash = await hashPassword(pin);
  await db.user.update({ where: { id: userId }, data: { liveAccessPinHash } });

  await db.auditLog.create({
    data: {
      actorType: "USER",
      actorId: userId,
      action: user.liveAccessPinHash ? "auth.live_pin_changed" : "auth.live_pin_configured",
      target: `user:${userId}`,
      metadata: {},
    },
  });
}

/**
 * Verify the Live Access PIN before a LIVE execution. Failed attempts are
 * written to the audit log.
 */
export async function verifyLiveAccessPin(
  userId: string,
  pin: string,
  db: PrismaClient = getPrismaClient(),
): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { liveAccessPinHash: true } });
  if (!user?.liveAccessPinHash) return false;

  const matches = await verifyPassword(user.liveAccessPinHash, pin);
  if (!matches) {
    await db.auditLog.create({
      data: {
        actorType: "USER",
        actorId: userId,
        action: "auth.live_pin_verification_failed",
        target: `user:${userId}`,
        metadata: {},
      },
    });
  }
  return matches;
}
