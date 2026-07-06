import { getPrismaClient, type PrismaClient } from "@pasa-trader/db";
import {
  AlpacaBrokerAdapter,
  IbkrBrokerAdapter,
  type BrokerAdapter,
  type BrokerConnectionStatus,
  type BrokerAccountRef,
} from "@pasa-trader/adapters";
import {
  alpacaCredentialSecretSchema,
  ibkrCredentialSecretSchema,
  brokerProviderSchema,
  type BrokerProvider,
  type BrokerAccountSummary,
  type BrokerEnvironment,
  type BrokerageEnvironment,
} from "@pasa-trader/schemas";
import { decryptCredentialSecret, getCredentialEncryptionKeyFromEnv } from "./credentials.js";


export class BrokerAccountNotFoundError extends Error {
  constructor() {
    super("Broker account not found.");
    this.name = "BrokerAccountNotFoundError";
  }
}

export class CredentialNotFoundError extends Error {
  constructor() {
    super("Credential not found or does not belong to user.");
    this.name = "CredentialNotFoundError";
  }
}

export class UnsupportedBrokerProviderError extends Error {
  constructor(provider: string) {
    super(`Unsupported broker provider: ${provider}`);
    this.name = "UnsupportedBrokerProviderError";
  }
}

type BrokerAdapterFactory = (input: {
  provider: BrokerProvider;
  userId: string;
  db: PrismaClient;
}) => BrokerAdapter;

function toBrokerAccountSummary(row: {
  id: string;
  credentialId: string;
  provider: string;
  label: string;
  environment: "PAPER" | "LIVE";
  brokerAccountId: string | null;
  status: "UNTESTED" | "CONNECTED" | "ERROR";
  lastTestedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): BrokerAccountSummary {
  return {
    id: row.id,
    credentialId: row.credentialId,
    provider: row.provider,
    label: row.label,
    environment: row.environment,
    brokerAccountId: row.brokerAccountId,
    status: row.status,
    lastTestedAt: row.lastTestedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function parseBrokerProvider(provider: string): BrokerProvider {
  const parsed = brokerProviderSchema.safeParse(provider.toLowerCase());
  if (!parsed.success) throw new UnsupportedBrokerProviderError(provider);
  return parsed.data;
}

async function resolveBrokerCredentialSecret(
  credentialId: string,
  userId: string,
  db: PrismaClient,
): Promise<{ provider: BrokerProvider; secret: string }> {
  const credential = await db.credential.findFirst({
    where: { id: credentialId, userId },
    select: { iv: true, encryptedPayload: true, authTag: true, provider: true, kind: true },
  });
  if (!credential) throw new CredentialNotFoundError();
  if (credential.kind !== "BROKER") throw new UnsupportedBrokerProviderError(credential.provider);
  const provider = parseBrokerProvider(credential.provider);

  const secret = decryptCredentialSecret(
    { iv: credential.iv, encryptedPayload: credential.encryptedPayload, authTag: credential.authTag },
    getCredentialEncryptionKeyFromEnv(),
  );
  return { provider, secret };
}

async function resolveAlpacaKeys(
  credentialId: string,
  userId: string,
  db: PrismaClient,
): Promise<{ keyId: string; secretKey: string }> {
  const resolved = await resolveBrokerCredentialSecret(credentialId, userId, db);
  if (resolved.provider !== "alpaca") throw new UnsupportedBrokerProviderError(resolved.provider);
  return alpacaCredentialSecretSchema.parse(JSON.parse(resolved.secret));
}

async function resolveIbkrCredentials(
  credentialId: string,
  userId: string,
  db: PrismaClient,
): Promise<{
  baseUrl: string;
  sessionToken?: string | undefined;
  paperAccountId?: string | undefined;
  liveAccountId?: string | undefined;
}> {
  const resolved = await resolveBrokerCredentialSecret(credentialId, userId, db);
  if (resolved.provider !== "ibkr") throw new UnsupportedBrokerProviderError(resolved.provider);
  return ibkrCredentialSecretSchema.parse(JSON.parse(resolved.secret));
}

function makeBrokerAdapter(input: {
  provider: BrokerProvider;
  userId: string;
  db: PrismaClient;
}): BrokerAdapter {
  switch (input.provider) {
    case "alpaca":
      return new AlpacaBrokerAdapter((credId) => resolveAlpacaKeys(credId, input.userId, input.db));
    case "ibkr":
      return new IbkrBrokerAdapter((credId) => resolveIbkrCredentials(credId, input.userId, input.db));
  }
}

export async function testBrokerConnection(
  input: { credentialId: string; environment: BrokerEnvironment; userId: string },
  db: PrismaClient = getPrismaClient(),
  adapterFactory: BrokerAdapterFactory = makeBrokerAdapter,
): Promise<BrokerConnectionStatus> {
  const credential = await db.credential.findFirst({
    where: { id: input.credentialId, userId: input.userId },
    select: { kind: true, provider: true },
  });
  if (!credential) throw new CredentialNotFoundError();
  if (credential.kind !== "BROKER") throw new UnsupportedBrokerProviderError(credential.provider);
  const provider = parseBrokerProvider(credential.provider);

  const brokerEnv = input.environment === "PAPER" ? "paper" : "live";
  const adapter = adapterFactory({ provider, userId: input.userId, db });
  return adapter.testConnection({ credentialId: input.credentialId, environment: brokerEnv });
}

export async function createBrokerAccount(
  input: {
    userId: string;
    credentialId: string;
    label: string;
    environment: BrokerEnvironment;
  },
  db: PrismaClient = getPrismaClient(),
  adapterFactory: BrokerAdapterFactory = makeBrokerAdapter,
): Promise<BrokerAccountSummary> {
  const brokerEnv = input.environment === "PAPER" ? "paper" : "live";

  const credential = await db.credential.findFirst({
    where: { id: input.credentialId, userId: input.userId },
    select: { provider: true, kind: true },
  });
  if (!credential) throw new CredentialNotFoundError();
  if (credential.kind !== "BROKER") throw new UnsupportedBrokerProviderError(credential.provider);
  const provider = parseBrokerProvider(credential.provider);

  const adapter = adapterFactory({ provider, userId: input.userId, db });

  let brokerAccountId: string | null = null;
  let status: "UNTESTED" | "CONNECTED" | "ERROR" = "UNTESTED";

  try {
    const accounts = await adapter.listAccounts({
      credentialId: input.credentialId,
      environment: brokerEnv,
    });
    brokerAccountId = accounts[0]?.accountId ?? null;
    status = "CONNECTED";
  } catch {
    status = "ERROR";
  }

  const row = await db.$transaction(async (tx) => {
    const created = await tx.brokerAccount.create({
      data: {
        userId: input.userId,
        credentialId: input.credentialId,
        provider: credential.provider,
        label: input.label,
        environment: input.environment,
        ...(brokerAccountId !== null && { brokerAccountId }),
        status,
        lastTestedAt: new Date(),
      },
    });

    await tx.auditLog.create({
      data: {
        actorType: "USER",
        actorId: input.userId,
        action: "broker_account.created",
        target: `broker_account:${created.id}`,
        metadata: {
          provider: credential.provider,
          environment: input.environment,
          status,
        },
      },
    });

    return created;
  });

  return toBrokerAccountSummary(row);
}

export async function listBrokerAccountsForUser(
  userId: string,
  db: PrismaClient = getPrismaClient(),
): Promise<BrokerAccountSummary[]> {
  const rows = await db.brokerAccount.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toBrokerAccountSummary);
}

export async function refreshBrokerAccountStatus(
  input: { brokerAccountId: string; userId: string },
  db: PrismaClient = getPrismaClient(),
  adapterFactory: BrokerAdapterFactory = makeBrokerAdapter,
): Promise<BrokerAccountSummary> {
  const account = await db.brokerAccount.findFirst({
    where: { id: input.brokerAccountId, userId: input.userId },
  });
  if (!account) throw new BrokerAccountNotFoundError();

  const brokerEnv = account.environment === "PAPER" ? "paper" : "live";
  const provider = parseBrokerProvider(account.provider);
  const adapter = adapterFactory({ provider, userId: input.userId, db });

  let brokerAccountId = account.brokerAccountId;
  let status: "UNTESTED" | "CONNECTED" | "ERROR";

  try {
    const accounts = await adapter.listAccounts({
      credentialId: account.credentialId,
      environment: brokerEnv,
    });
    brokerAccountId = accounts[0]?.accountId ?? brokerAccountId;
    status = "CONNECTED";
  } catch {
    status = "ERROR";
  }

  const updated = await db.brokerAccount.update({
    where: { id: input.brokerAccountId },
    data: { status, lastTestedAt: new Date(), ...(brokerAccountId !== null && { brokerAccountId }) },
  });

  return toBrokerAccountSummary(updated);
}

export async function getBrokerAdapterForAccount(
  brokerAccountId: string,
  userId: string,
  db: PrismaClient = getPrismaClient(),
): Promise<{ adapter: BrokerAdapter; accountRef: BrokerAccountRef }> {
  const account = await db.brokerAccount.findFirst({
    where: { id: brokerAccountId, userId },
  });
  if (!account) throw new BrokerAccountNotFoundError();

  const provider = parseBrokerProvider(account.provider);
  const adapter = makeBrokerAdapter({ provider, userId, db });

  const accountRef: BrokerAccountRef = {
    credentialId: account.credentialId,
    environment: account.environment.toLowerCase() as BrokerageEnvironment,
    accountId: account.brokerAccountId ?? "",
  };

  return { adapter, accountRef };
}

export async function deleteBrokerAccount(
  input: { brokerAccountId: string; userId: string },
  db: PrismaClient = getPrismaClient(),
): Promise<void> {
  const account = await db.brokerAccount.findFirst({
    where: { id: input.brokerAccountId, userId: input.userId },
    select: { id: true, provider: true, environment: true },
  });

  if (!account) {
    throw new BrokerAccountNotFoundError();
  }

  await db.$transaction(async (tx) => {
    await tx.brokerAccount.delete({ where: { id: input.brokerAccountId } });

    await tx.auditLog.create({
      data: {
        actorType: "USER",
        actorId: input.userId,
        action: "broker_account.deleted",
        target: `broker_account:${input.brokerAccountId}`,
        metadata: { provider: account.provider, environment: account.environment },
      },
    });
  });
}
