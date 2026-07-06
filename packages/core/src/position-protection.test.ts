import { describe, it, expect, vi, beforeEach } from "vitest";
import { recoverUnprotectedPositions, MAX_STOP_RETRIES } from "./position-protection.js";
import { getBrokerAdapterForAccount } from "./broker-accounts.js";

vi.mock("./broker-accounts.js", () => ({
  getBrokerAdapterForAccount: vi.fn(),
}));

process.env.CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32).toString("base64");

const mockStrategy = {
  id: "strategy-1",
  userId: "user-1",
  trailingStopConfig: { trailPercent: 5 },
};

function makeRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "record-1",
    proposedOrderId: "order-1",
    brokerAccountId: "acc-1",
    symbol: "AAPL",
    side: "BUY",
    quantity: 5,
    status: "FILLED",
    stopProtected: false,
    stopRetryCount: 0,
    proposedOrder: {
      packet: { strategyInstance: mockStrategy },
    },
    ...overrides,
  };
}

function makeDbMock(records: unknown[]) {
  return {
    orderRecord: {
      findMany: vi.fn().mockResolvedValue(records),
      update: vi.fn().mockResolvedValue({}),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    notification: {
      create: vi.fn().mockResolvedValue({}),
    },
  } as any;
}

function mockAdapter(overrides: Record<string, unknown> = {}) {
  const adapter = {
    type: "alpaca",
    listOpenOrders: vi.fn().mockResolvedValue([]),
    placeTrailingStop: vi.fn().mockResolvedValue({
      brokerOrderId: "stop-broker-1",
      clientOrderId: "stop-order-1-r1",
      status: "accepted",
      filledAt: null,
      filledQty: null,
      filledAvgPrice: null,
      rejectedReason: null,
    }),
    ...overrides,
  };
  vi.mocked(getBrokerAdapterForAccount).mockResolvedValue({
    adapter,
    accountRef: { credentialId: "cred-1", environment: "paper", accountId: "acc-1" },
  } as any);
  return adapter;
}

beforeEach(() => {
  vi.mocked(getBrokerAdapterForAccount).mockReset();
});

describe("recoverUnprotectedPositions", () => {
  it("re-places the trailing stop and marks the record protected", async () => {
    const adapter = mockAdapter();
    const dbMock = makeDbMock([makeRecord()]);

    const result = await recoverUnprotectedPositions(dbMock);

    expect(result.recovered).toBe(1);
    expect(adapter.placeTrailingStop).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: "AAPL", quantity: 5, trailPercent: 5 }),
    );
    expect(dbMock.orderRecord.update).toHaveBeenCalledWith({
      where: { id: "record-1" },
      data: { stopProtected: true, trailingStopOrderId: "stop-broker-1", stopPlacementError: null },
    });
    const notification = dbMock.notification.create.mock.calls[0][0].data;
    expect(notification.severity).toBe("INFO");
  });

  it("adopts an existing open protective sell order instead of double-stopping", async () => {
    const adapter = mockAdapter({
      listOpenOrders: vi.fn().mockResolvedValue([
        { brokerOrderId: "existing-stop", symbol: "AAPL", side: "sell", qty: 5, status: "accepted", createdAt: new Date() },
      ]),
    });
    const dbMock = makeDbMock([makeRecord()]);

    const result = await recoverUnprotectedPositions(dbMock);

    expect(result.adopted).toBe(1);
    expect(adapter.placeTrailingStop).not.toHaveBeenCalled();
    expect(dbMock.orderRecord.update).toHaveBeenCalledWith({
      where: { id: "record-1" },
      data: { stopProtected: true, trailingStopOrderId: "existing-stop", stopPlacementError: null },
    });
  });

  it("skips records whose strategy has no trailing stop configured", async () => {
    mockAdapter();
    const record = makeRecord({
      proposedOrder: {
        packet: { strategyInstance: { ...mockStrategy, trailingStopConfig: null } },
      },
    });
    const dbMock = makeDbMock([record]);

    const result = await recoverUnprotectedPositions(dbMock);

    expect(result.scanned).toBe(0);
    expect(dbMock.orderRecord.update).not.toHaveBeenCalled();
  });

  it("increments retry count and records error on rejected stop", async () => {
    mockAdapter({
      placeTrailingStop: vi.fn().mockResolvedValue({
        brokerOrderId: "",
        clientOrderId: "",
        status: "rejected",
        filledAt: null,
        filledQty: null,
        filledAvgPrice: null,
        rejectedReason: "rate limited",
      }),
    });
    const dbMock = makeDbMock([makeRecord()]);

    const result = await recoverUnprotectedPositions(dbMock);

    expect(result.failed).toBe(1);
    expect(result.escalated).toBe(0);
    expect(dbMock.orderRecord.update).toHaveBeenCalledWith({
      where: { id: "record-1" },
      data: { stopRetryCount: 1, stopPlacementError: "rate limited" },
    });
    expect(dbMock.notification.create).not.toHaveBeenCalled();
  });

  it("raises a CRITICAL notification after the third consecutive failure", async () => {
    mockAdapter({
      placeTrailingStop: vi.fn().mockRejectedValue(new Error("broker down")),
    });
    const dbMock = makeDbMock([makeRecord({ stopRetryCount: MAX_STOP_RETRIES - 1 })]);

    const result = await recoverUnprotectedPositions(dbMock);

    expect(result.failed).toBe(1);
    expect(result.escalated).toBe(1);
    const notification = dbMock.notification.create.mock.calls[0][0].data;
    expect(notification.severity).toBe("CRITICAL");
    expect(notification.kind).toBe("STOP_FAILURE");
    expect(notification.message).toContain("manual intervention");
  });

  it("queries only unprotected entry orders under the retry limit", async () => {
    mockAdapter();
    const dbMock = makeDbMock([]);

    await recoverUnprotectedPositions(dbMock);

    expect(dbMock.orderRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          side: { in: ["BUY", "BUY_TO_COVER"] },
          stopProtected: false,
          stopRetryCount: { lt: MAX_STOP_RETRIES },
        }),
      }),
    );
  });
});
