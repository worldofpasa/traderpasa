CREATE TYPE "CredentialKind" AS ENUM (
  'BROKER',
  'MODEL_PROVIDER',
  'SOURCE_PROVIDER',
  'NOTIFICATION_PROVIDER'
);

CREATE TABLE "Credential" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" "CredentialKind" NOT NULL,
  "provider" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "encryptedPayload" TEXT NOT NULL,
  "iv" TEXT NOT NULL,
  "authTag" TEXT NOT NULL,
  "keyVersion" TEXT NOT NULL DEFAULT 'v1',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Credential_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Credential_userId_kind_provider_idx" ON "Credential"("userId", "kind", "provider");

ALTER TABLE "Credential"
  ADD CONSTRAINT "Credential_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
