import { describe, it, expect, vi } from "vitest";
import {
  testBrokerConnection,
  createBrokerAccount,
  listBrokerAccountsForUser,
  refreshBrokerAccountStatus,
  CredentialNotFoundError,
  UnsupportedBrokerProviderError,
  BrokerAccountNotFoundError,
} from "./broker-accounts.js";
import type { BrokerAdapter } from "@pasa-trader/adapters";
import type { PrismaClient } from "@pasa-trader/db";

vi.mock("./credentials.js", () => ({
  decryptCredentialSecret: vi.fn().mockReturnValue('{"keyId":"KEY","secretKey":"SECRET"}'),
  getCredentialEncryptionKeyFromEnv: vi.fn().mockReturnValue(Buffer.alloc(32)),
}));

const BASE_ACCOUNT = {
  id: "ba-1",
  userId: "user-1",
  credentialId: "cred-1",
  provider: "alpaca",
  label: "Paper Account",
  environment: "PAPER" as const,
  brokerAccountId: "alpaca-acc-1",
  status: "CONNECTED" as const,
  lastTestedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

const BROKER_CREDENTIAL = {
  provider: "alpaca",
  kind: "BROKER" as const,
  iv: "iv",
  encryptedPayload: "enc",
  authTag: "tag",
};

function makeDb(overrides: Partial<{
  credentialFindFirst: ReturnType<typeof vi.fn>;
  brokerAccountCreate: ReturnType<typeof vi.fn>;
  brokerAccountFindMany: ReturnType<typeof vi.fn>;
  brokerAccountFindFirst: ReturnType<typeof vi.fn>;
  brokerAccountUpdate: ReturnType<typeof vi.fn>;
}> = {}) {
  const auditCreate = vi.fn().mockResolvedValue({});
  const brokerAccountCreate = overrides.brokerAccountCreate ?? vi.fn().mockResolvedValue(BASE_ACCOUNT);
  return {
    credential: {
      findFirst: overrides.credentialFindFirst ?? vi.fn().mockResolvedValue(BROKER_CREDENTIAL),
    },
    brokerAccount: {
      create: brokerAccountCreate,
      findMany: overrides.brokerAccountFindMany ?? vi.fn().mockResolvedValue([BASE_ACCOUNT]),
      findFirst: overrides.brokerAccountFindFirst ?? vi.fn().mockResolvedValue(BASE_ACCOUNT),
      update: overrides.brokerAccountUpdate ?? vi.fn().mockResolvedValue({ ...BASE_ACCOUNT, status: "CONNECTED" }),
    },
    auditLog: { create: auditCreate },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ brokerAccount: { create: brokerAccountCreate }, auditLog: { create: auditCreate } }),
    ),
  } as unknown as PrismaClient;
}

function makeAdapter(overrides: Partial<BrokerAdapter> = {}): BrokerAdapter {
  return {
    type: "alpaca",
    testConnection: vi.fn().mockResolvedValue({ ok: true, message: "Connected", checkedAt: new Date() }),
    listAccounts: vi.fn().mockResolvedValue([
      { accountId: "alpaca-acc-1", environment: "paper", currency: "USD", status: "ACTIVE" },
    ]),
    getAccount: vi.fn(),
    getCapabilities: vi.fn(),
    submitOrder: vi.fn(),
    placeTrailingStop: vi.fn(),
    listOpenOrders: vi.fn().mockResolvedValue([]),
    getOrder: vi.fn(),
    ...overrides,
  };
}

describe("testBrokerConnection", () => {
  it("returns ok=true when adapter reports connected", async () => {
    const testConnection = vi.fn().mockResolvedValue({ ok: true, message: "Connected", checkedAt: new Date() });
    const adapter = makeAdapter({ testConnection });
    const db = makeDb();

    const result = await testBrokerConnection(
      { credentialId: "cred-1", environment: "PAPER", userId: "user-1" },
      db,
      () => adapter,
    );

    expect(result.ok).toBe(true);
    expect(testConnection).toHaveBeenCalledWith({ credentialId: "cred-1", environment: "paper" });
  });

  it("throws CredentialNotFoundError when credential does not exist", async () => {
    const db = makeDb({ credentialFindFirst: vi.fn().mockResolvedValue(null) });

    await expect(
      testBrokerConnection(
        { credentialId: "missing", environment: "PAPER", userId: "user-1" },
        db,
        () => makeAdapter(),
      ),
    ).rejects.toBeInstanceOf(CredentialNotFoundError);
  });

  it("throws UnsupportedBrokerProviderError for non-BROKER credential kind", async () => {
    const db = makeDb({
      credentialFindFirst: vi.fn().mockResolvedValue({
        provider: "openai",
        kind: "MODEL_PROVIDER",
        iv: "i",
        encryptedPayload: "e",
        authTag: "a",
      }),
    });

    await expect(
      testBrokerConnection(
        { credentialId: "cred-2", environment: "PAPER", userId: "user-1" },
        db,
        () => makeAdapter(),
      ),
    ).rejects.toBeInstanceOf(UnsupportedBrokerProviderError);
  });

  it("maps LIVE environment correctly to adapter", async () => {
    const testConnection = vi.fn().mockResolvedValue({ ok: true, message: "Connected", checkedAt: new Date() });
    const adapter = makeAdapter({ testConnection });
    const db = makeDb();

    await testBrokerConnection(
      { credentialId: "cred-1", environment: "LIVE", userId: "user-1" },
      db,
      () => adapter,
    );

    expect(testConnection).toHaveBeenCalledWith({ credentialId: "cred-1", environment: "live" });
  });

  it("routes IBKR credentials through the requested provider adapter", async () => {
    const testConnection = vi.fn().mockResolvedValue({ ok: true, message: "Connected", checkedAt: new Date() });
    const adapter = makeAdapter({ type: "ibkr", testConnection });
    const db = makeDb({
      credentialFindFirst: vi.fn().mockResolvedValue({ ...BROKER_CREDENTIAL, provider: "ibkr" }),
    });
    const factory = vi.fn().mockReturnValue(adapter);

    await testBrokerConnection(
      { credentialId: "cred-ibkr", environment: "PAPER", userId: "user-1" },
      db,
      factory,
    );

    expect(factory).toHaveBeenCalledWith({ provider: "ibkr", userId: "user-1", db });
    expect(testConnection).toHaveBeenCalledWith({ credentialId: "cred-ibkr", environment: "paper" });
  });
});

describe("createBrokerAccount", () => {
  it("creates account with CONNECTED status when adapter responds", async () => {
    const adapter = makeAdapter();
    const db = makeDb();

    const result = await createBrokerAccount(
      { userId: "user-1", credentialId: "cred-1", label: "Paper Account", environment: "PAPER" },
      db,
      () => adapter,
    );

    expect(result.status).toBe("CONNECTED");
    expect(result.environment).toBe("PAPER");
  });

  it("creates account with ERROR status when listAccounts fails", async () => {
    const adapter = makeAdapter({
      listAccounts: vi.fn().mockRejectedValue(new Error("network error")),
    });
    const failedAccount = { ...BASE_ACCOUNT, status: "ERROR" as const, brokerAccountId: null };
    const db = makeDb({ brokerAccountCreate: vi.fn().mockResolvedValue(failedAccount) });

    const result = await createBrokerAccount(
      { userId: "user-1", credentialId: "cred-1", label: "Paper Account", environment: "PAPER" },
      db,
      () => adapter,
    );

    expect(result.status).toBe("ERROR");
  });

  it("throws CredentialNotFoundError when credential missing", async () => {
    const db = makeDb({ credentialFindFirst: vi.fn().mockResolvedValue(null) });

    await expect(
      createBrokerAccount(
        { userId: "user-1", credentialId: "missing", label: "Test", environment: "PAPER" },
        db,
        () => makeAdapter(),
      ),
    ).rejects.toBeInstanceOf(CredentialNotFoundError);
  });
});

describe("listBrokerAccountsForUser", () => {
  it("returns all broker accounts for user", async () => {
    const db = makeDb({ brokerAccountFindMany: vi.fn().mockResolvedValue([BASE_ACCOUNT]) });

    const accounts = await listBrokerAccountsForUser("user-1", db);

    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.environment).toBe("PAPER");
  });

  it("returns empty array when no accounts", async () => {
    const db = makeDb({ brokerAccountFindMany: vi.fn().mockResolvedValue([]) });

    const accounts = await listBrokerAccountsForUser("user-1", db);

    expect(accounts).toHaveLength(0);
  });
});

describe("refreshBrokerAccountStatus", () => {
  it("throws BrokerAccountNotFoundError when account not found", async () => {
    const db = makeDb({ brokerAccountFindFirst: vi.fn().mockResolvedValue(null) });

    await expect(
      refreshBrokerAccountStatus({ brokerAccountId: "missing", userId: "user-1" }, db, () => makeAdapter()),
    ).rejects.toBeInstanceOf(BrokerAccountNotFoundError);
  });

  it("updates status to CONNECTED and returns updated account", async () => {
    const brokerAccountUpdate = vi.fn().mockResolvedValue({ ...BASE_ACCOUNT, status: "CONNECTED", lastTestedAt: new Date() });
    const db = makeDb({ brokerAccountUpdate });

    const result = await refreshBrokerAccountStatus(
      { brokerAccountId: "ba-1", userId: "user-1" },
      db,
      () => makeAdapter(),
    );

    expect(result.status).toBe("CONNECTED");
    expect(brokerAccountUpdate).toHaveBeenCalled();
  });

  it("sets ERROR status when refresh listAccounts fails", async () => {
    const adapter = makeAdapter({
      listAccounts: vi.fn().mockRejectedValue(new Error("timeout")),
    });
    const brokerAccountUpdate = vi.fn().mockResolvedValue({ ...BASE_ACCOUNT, status: "ERROR" });
    const db = makeDb({ brokerAccountUpdate });

    const result = await refreshBrokerAccountStatus(
      { brokerAccountId: "ba-1", userId: "user-1" },
      db,
      () => adapter,
    );

    expect(result.status).toBe("ERROR");
  });
});
