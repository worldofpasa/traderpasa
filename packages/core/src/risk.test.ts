import { describe, it, expect, vi } from "vitest";
import { validateRiskForPacket } from "./risk.js";
import { getBrokerAdapterForAccount } from "./broker-accounts.js";

vi.mock("./broker-accounts.js", () => {
  return {
    getBrokerAdapterForAccount: vi.fn().mockResolvedValue({
      adapter: {
        type: "alpaca",
        testConnection: vi.fn(),
        listAccounts: vi.fn(),
        getAccount: vi.fn().mockResolvedValue({
          accountId: "acc-1",
          buyingPower: 5000,
          cash: 5000,
          portfolioValue: 10000,
          dayTradeCount: 0,
        }),
        getCapabilities: vi.fn().mockResolvedValue({
          supportsShortSelling: true,
          supportsMarketOrders: true,
          supportsLimitOrders: true,
          supportsTrailingStops: true,
          maxOrdersPerDay: 100,
        }),
        listOpenOrders: vi.fn().mockResolvedValue([]),
      },
      accountRef: { credentialId: "cred-1", environment: "paper", accountId: "acc-1" },
    }),
  };
});

process.env.CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32).toString("base64");

describe("validateRiskForPacket", () => {
  const mockStrategy = {
    id: "strategy-1",
    userId: "user-1",
    symbols: ["AAPL"],
    sourceConfig: {
      "alpaca-market": { enabled: true, required: true },
    },
    riskConfig: {
      maxPositionPct: 10,
      restrictedTickers: ["TSLA"],
    },
    brokerAccountId: "acc-1",
  };

  const mockProposedOrders = [
    {
      id: "order-1",
      symbol: "AAPL",
      side: "BUY" as const,
      quantity: 5, // 5 * 150 = 750 (under 10% of portfolioValue 10000 = 1000)
      orderType: "LIMIT" as const,
      limitPrice: 150,
      environment: "PAPER" as const,
      brokerAccountId: "acc-1",
      rationale: "Reason",
      evidenceItemIds: ["item-1"],
    },
  ];

  const mockPacket = {
    id: "packet-1",
    strategyInstanceId: "strategy-1",
    evidenceBundleId: "bundle-1",
    proposedOrders: mockProposedOrders,
    strategyInstance: mockStrategy,
  };

  it("passes when all checks pass", async () => {
    const dbMock = {
      proposedOrderPacket: {
        findUnique: vi.fn().mockResolvedValue(mockPacket),
        update: vi.fn().mockResolvedValue({}),
      },
      evidenceBundle: {
        findUnique: vi.fn().mockResolvedValue({ id: "bundle-1", status: "COMPLETE", sourceResults: { "alpaca-market": "succeeded" } }),
      },
      proposedOrder: {
        update: vi.fn().mockResolvedValue({}),
      },
      strategyInstance: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    } as any;

    const result = await validateRiskForPacket("packet-1", dbMock);

    expect(result.packetStatus).toBe("pass");
    const appleOrder = result.orderResults["order-1"];
    expect(appleOrder).toBeDefined();
    expect(appleOrder?.status).toBe("pass");
  });

  it("blocks order if it exceeds available buying power", async () => {
    const largeOrder = {
      ...mockProposedOrders[0],
      quantity: 100, // value is 100 * 150 = 15000 (exceeds buying power 5000)
    };

    const dbMock = {
      proposedOrderPacket: {
        findUnique: vi.fn().mockResolvedValue({ ...mockPacket, proposedOrders: [largeOrder] }),
        update: vi.fn().mockResolvedValue({}),
      },
      evidenceBundle: {
        findUnique: vi.fn().mockResolvedValue({ id: "bundle-1", status: "COMPLETE", sourceResults: { "alpaca-market": "succeeded" } }),
      },
      proposedOrder: {
        update: vi.fn().mockResolvedValue({}),
      },
      strategyInstance: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    } as any;

    const result = await validateRiskForPacket("packet-1", dbMock);

    expect(result.packetStatus).toBe("hard_block");
    const check = result.orderResults["order-1"]?.checks.find((c: any) => c.code === "INSUFFICIENT_BUYING_POWER");
    expect(check).toBeDefined();
    expect(check?.severity).toBe("hard_block");
  });

  it("blocks order if symbol is in restricted tickers list", async () => {
    const restrictedOrder = {
      ...mockProposedOrders[0],
      symbol: "TSLA",
    };

    const dbMock = {
      proposedOrderPacket: {
        findUnique: vi.fn().mockResolvedValue({ ...mockPacket, proposedOrders: [restrictedOrder] }),
        update: vi.fn().mockResolvedValue({}),
      },
      evidenceBundle: {
        findUnique: vi.fn().mockResolvedValue({ id: "bundle-1", status: "COMPLETE", sourceResults: { "alpaca-market": "succeeded" } }),
      },
      proposedOrder: {
        update: vi.fn().mockResolvedValue({}),
      },
      strategyInstance: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    } as any;

    const result = await validateRiskForPacket("packet-1", dbMock);

    expect(result.packetStatus).toBe("hard_block");
    const check = result.orderResults["order-1"]?.checks.find((c: any) => c.code === "RESTRICTED_TICKER");
    expect(check).toBeDefined();
  });

  it("blocks order if required evidence failed", async () => {
    const dbMock = {
      proposedOrderPacket: {
        findUnique: vi.fn().mockResolvedValue(mockPacket),
        update: vi.fn().mockResolvedValue({}),
      },
      evidenceBundle: {
        findUnique: vi.fn().mockResolvedValue({ id: "bundle-1", status: "FAILED", sourceResults: { "alpaca-market": "failed" } }),
      },
      proposedOrder: {
        update: vi.fn().mockResolvedValue({}),
      },
      strategyInstance: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    } as any;

    const result = await validateRiskForPacket("packet-1", dbMock);

    expect(result.packetStatus).toBe("hard_block");
    const check = result.orderResults["order-1"]?.checks.find((c: any) => c.code === "MISSING_REQUIRED_EVIDENCE");
    expect(check).toBeDefined();
  });

  function makeDbMock(packet: unknown, executedTodayCount = 0) {
    return {
      proposedOrderPacket: {
        findUnique: vi.fn().mockResolvedValue(packet),
        update: vi.fn().mockResolvedValue({}),
      },
      evidenceBundle: {
        findUnique: vi.fn().mockResolvedValue({ id: "bundle-1", status: "COMPLETE", sourceResults: { "alpaca-market": "succeeded" } }),
      },
      proposedOrder: {
        update: vi.fn().mockResolvedValue({}),
        count: vi.fn().mockResolvedValue(executedTodayCount),
      },
      strategyInstance: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    } as any;
  }

  function mockAccountSnapshot(overrides: Record<string, unknown>) {
    vi.mocked(getBrokerAdapterForAccount).mockResolvedValueOnce({
      adapter: {
        type: "alpaca",
        testConnection: vi.fn(),
        listAccounts: vi.fn(),
        getAccount: vi.fn().mockResolvedValue({
          accountId: "acc-1",
          buyingPower: 5000,
          cash: 5000,
          portfolioValue: 10000,
          lastEquity: null,
          dayTradeCount: 0,
          ...overrides,
        }),
        getCapabilities: vi.fn().mockResolvedValue({
          supportsShortSelling: true,
          supportsMarketOrders: true,
          supportsLimitOrders: true,
          supportsTrailingStops: true,
        }),
        listOpenOrders: vi.fn().mockResolvedValue([]),
      },
      accountRef: { credentialId: "cred-1", environment: "paper", accountId: "acc-1" },
    } as any);
  }

  it("blocks entry order when projected account exposure exceeds maxAccountExposurePct", async () => {
    // current exposure = portfolioValue 10000 - cash 5000 = 5000; order adds 750 → 5750 > 55% cap (5500)
    const packet = {
      ...mockPacket,
      strategyInstance: {
        ...mockStrategy,
        riskConfig: { maxAccountExposurePct: 55 },
      },
    };
    const dbMock = makeDbMock(packet);

    const result = await validateRiskForPacket("packet-1", dbMock);

    expect(result.packetStatus).toBe("hard_block");
    const check = result.orderResults["order-1"]?.checks.find((c: any) => c.code === "MAX_ACCOUNT_EXPOSURE");
    expect(check).toBeDefined();
    expect(check?.severity).toBe("hard_block");
  });

  it("passes when projected account exposure stays under maxAccountExposurePct", async () => {
    // projected exposure 5750 ≤ 60% cap (6000)
    const packet = {
      ...mockPacket,
      strategyInstance: {
        ...mockStrategy,
        riskConfig: { maxAccountExposurePct: 60 },
      },
    };
    const dbMock = makeDbMock(packet);

    const result = await validateRiskForPacket("packet-1", dbMock);

    expect(result.packetStatus).toBe("pass");
  });

  it("blocks all orders when maxOrdersPerDay has been reached", async () => {
    const packet = {
      ...mockPacket,
      strategyInstance: {
        ...mockStrategy,
        riskConfig: { maxOrdersPerDay: 3 },
      },
    };
    const dbMock = makeDbMock(packet, 3);

    const result = await validateRiskForPacket("packet-1", dbMock);

    expect(result.packetStatus).toBe("hard_block");
    const check = result.orderResults["order-1"]?.checks.find((c: any) => c.code === "MAX_ORDERS_PER_DAY");
    expect(check).toBeDefined();
    expect(check?.severity).toBe("hard_block");
    expect(dbMock.proposedOrder.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "EXECUTED",
          packet: { strategyInstanceId: "strategy-1" },
        }),
      }),
    );
  });

  it("passes when executed orders today are below maxOrdersPerDay", async () => {
    const packet = {
      ...mockPacket,
      strategyInstance: {
        ...mockStrategy,
        riskConfig: { maxOrdersPerDay: 3 },
      },
    };
    const dbMock = makeDbMock(packet, 2);

    const result = await validateRiskForPacket("packet-1", dbMock);

    expect(result.packetStatus).toBe("pass");
  });

  it("blocks entry orders when daily loss exceeds dailyLossThresholdPct", async () => {
    // drawdown = (11000 - 10000) / 11000 ≈ 9.09% ≥ 5%
    mockAccountSnapshot({ lastEquity: 11000 });
    const packet = {
      ...mockPacket,
      strategyInstance: {
        ...mockStrategy,
        riskConfig: { dailyLossThresholdPct: 5 },
      },
    };
    const dbMock = makeDbMock(packet);

    const result = await validateRiskForPacket("packet-1", dbMock);

    expect(result.packetStatus).toBe("hard_block");
    const check = result.orderResults["order-1"]?.checks.find((c: any) => c.code === "DAILY_LOSS_THRESHOLD");
    expect(check).toBeDefined();
  });

  it("allows exit (SELL) orders when daily loss threshold is breached", async () => {
    mockAccountSnapshot({ lastEquity: 11000 });
    const sellOrder = { ...mockProposedOrders[0], side: "SELL" as const };
    const packet = {
      ...mockPacket,
      proposedOrders: [sellOrder],
      strategyInstance: {
        ...mockStrategy,
        riskConfig: { dailyLossThresholdPct: 5 },
      },
    };
    const dbMock = makeDbMock(packet);

    const result = await validateRiskForPacket("packet-1", dbMock);

    const check = result.orderResults["order-1"]?.checks.find((c: any) => c.code === "DAILY_LOSS_THRESHOLD");
    expect(check).toBeUndefined();
    expect(result.packetStatus).toBe("pass");
  });

  it("passes entry orders when drawdown is under dailyLossThresholdPct", async () => {
    // drawdown = (10100 - 10000) / 10100 ≈ 0.99% < 5%
    mockAccountSnapshot({ lastEquity: 10100 });
    const packet = {
      ...mockPacket,
      strategyInstance: {
        ...mockStrategy,
        riskConfig: { dailyLossThresholdPct: 5 },
      },
    };
    const dbMock = makeDbMock(packet);

    const result = await validateRiskForPacket("packet-1", dbMock);

    expect(result.packetStatus).toBe("pass");
  });

  it("warns when dailyLossThresholdPct is set but broker reports no previous-close equity", async () => {
    mockAccountSnapshot({ lastEquity: null });
    const packet = {
      ...mockPacket,
      strategyInstance: {
        ...mockStrategy,
        riskConfig: { dailyLossThresholdPct: 5 },
      },
    };
    const dbMock = makeDbMock(packet);

    const result = await validateRiskForPacket("packet-1", dbMock);

    expect(result.packetStatus).toBe("warning");
    const check = result.orderResults["order-1"]?.checks.find((c: any) => c.code === "DAILY_LOSS_UNKNOWN");
    expect(check).toBeDefined();
    expect(check?.severity).toBe("warning");
  });
});
