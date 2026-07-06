-- Secondary Live Access PIN (argon2 hash) gating LIVE packet execution (#94)
ALTER TABLE "User" ADD COLUMN "liveAccessPinHash" TEXT;
