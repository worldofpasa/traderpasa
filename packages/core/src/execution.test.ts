import { describe, it, expect, vi, beforeEach } from "vitest";
import { executePacket, OrderExecutionError } from "./execution.js";

// Mock risk validation
const mockValidateRiskForPacket = vi.fn();
vi.mock("./risk.js", () => {
  return {
    validateRiskForPacket: (...args: any[]) => mockValidateRiskForPacket(...args),
  };
});

// Mock broker adapter retrieval
const mockBrokerAdapter = {
  getAccount: vi.fn(),
  submitOrder: vi.fn(),
  placeTrailingStop: vi.fn(),
};

const mockGetBrokerAdapterForAccount = vi.fn();
vi.mock("./broker-accounts.js", () => {
  return {
    getBrokerAdapterForAccount: (...args: any[]) => mockGetBrokerAdapterForAccount(...args),
  };
});

describe("executePacket", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const mockStrategy = {
    id: "strategy-1",
    userId: "user-1",
    name: "Momentum Template",
    executionMode: "PAPER" as const,
    brokerAccountId: "broker-acc-1",
    liveAcknowledgedAt: null,
    trailingStopConfig: { trailPercent: 5 },
  };

  const mockProposedOrders = [
    {
      id: "order-1",
      symbol: "AAPL",
      side: "BUY" as const,
      quantity: 10,
      orderType: "MARKET" as const,
      limitPrice: null,
      environment: "PAPER" as const,
      brokerAccountId: "broker-acc-1",
      rationale: "Go Long",
      evidenceItemIds: ["item-1"],
    },
  ];

  const mockPacket = {
    id: "packet-1",
    status: "DRAFT" as const,
    strategyInstanceId: "strategy-1",
    evidenceBundleId: "bundle-1",
    proposedOrders: mockProposedOrders,
    strategyInstance: mockStrategy,
  };

  it("fails if packet is not found", async () => {
    const dbMock = {
      proposedOrderPacket: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    } as any;

    await expect(executePacket("packet-1", dbMock)).rejects.toThrow(OrderExecutionError);
  });

  it("fails if packet is in terminal state", async () => {
    const dbMock = {
      proposedOrderPacket: {
        findUnique: vi.fn().mockResolvedValue({
          ...mockPacket,
          status: "EXECUTED",
        }),
      },
    } as any;

    await expect(executePacket("packet-1", dbMock)).rejects.toThrow(OrderExecutionError);
  });

  it("rejects execution if strategy is live but not acknowledged", async () => {
    const dbMock = {
      proposedOrderPacket: {
        findUnique: vi.fn().mockResolvedValue({
          ...mockPacket,
          strategyInstance: {
            ...mockStrategy,
            executionMode: "LIVE",
            liveAcknowledgedAt: null,
          },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      notification: {
        create: vi.fn().mockResolvedValue({}),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    } as any;

    await expect(executePacket("packet-1", dbMock)).rejects.toThrow("Live trading execution mode requires user acknowledgment.");
    expect(dbMock.proposedOrderPacket.update).toHaveBeenCalledWith({
      where: { id: "packet-1" },
      data: { status: "REJECTED" },
    });
  });

  it("blocks and rejects when risk validation returns a hard_block", async () => {
    mockValidateRiskForPacket.mockResolvedValue({
      packetStatus: "hard_block",
      orderResults: {
        "order-1": { status: "hard_block", checks: [] },
      },
    });

    const dbMock = {
      proposedOrderPacket: {
        findUnique: vi.fn().mockResolvedValue(mockPacket),
        update: vi.fn().mockResolvedValue({}),
      },
      proposedOrder: {
        update: vi.fn().mockResolvedValue({}),
      },
      notification: {
        create: vi.fn().mockResolvedValue({}),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    } as any;

    await expect(executePacket("packet-1", dbMock)).rejects.toThrow("Execution blocked by deterministic risk engine.");
    expect(dbMock.proposedOrderPacket.update).toHaveBeenCalledWith({
      where: { id: "packet-1" },
      data: { status: "REJECTED" },
    });
    expect(dbMock.proposedOrder.update).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: { status: "REJECTED" },
    });
  });

  it("blocks execution if broker connectivity fails", async () => {
    mockValidateRiskForPacket.mockResolvedValue({
      packetStatus: "pass",
      orderResults: {},
    });

    mockGetBrokerAdapterForAccount.mockImplementation(() => {
      throw new Error("API outage");
    });

    const dbMock = {
      proposedOrderPacket: {
        findUnique: vi.fn().mockResolvedValue(mockPacket),
        update: vi.fn().mockResolvedValue({}),
      },
      proposedOrder: {
        update: vi.fn().mockResolvedValue({}),
      },
      notification: {
        create: vi.fn().mockResolvedValue({}),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    } as any;

    await expect(executePacket("packet-1", dbMock)).rejects.toThrow("Broker connection failed: API outage");
    expect(dbMock.proposedOrderPacket.update).toHaveBeenCalledWith({
      where: { id: "packet-1" },
      data: { status: "REJECTED" },
    });
  });

  it("executes orders, saves order records, and places trailing stops on success", async () => {
    mockValidateRiskForPacket.mockResolvedValue({
      packetStatus: "pass",
      orderResults: {},
    });

    mockGetBrokerAdapterForAccount.mockResolvedValue({
      adapter: mockBrokerAdapter,
      accountRef: { credentialId: "cred-1", environment: "paper", accountId: "acc-1" },
    });

    mockBrokerAdapter.getAccount.mockResolvedValue({ buyingPower: 10000 });
    mockBrokerAdapter.submitOrder.mockResolvedValue({
      brokerOrderId: "b-order-1",
      clientOrderId: "pasa-order-1",
      status: "filled",
      filledAt: new Date(),
      filledQty: 10,
      filledAvgPrice: 150,
      rejectedReason: null,
    });
    mockBrokerAdapter.placeTrailingStop.mockResolvedValue({
      brokerOrderId: "b-stop-1",
      clientOrderId: "stop-order-1",
      status: "accepted",
      filledAt: null,
      filledQty: null,
      filledAvgPrice: null,
      rejectedReason: null,
    });

    const dbMock = {
      proposedOrderPacket: {
        findUnique: vi.fn().mockResolvedValue(mockPacket),
        update: vi.fn().mockResolvedValue({}),
      },
      proposedOrder: {
        update: vi.fn().mockResolvedValue({}),
      },
      orderRecord: {
        create: vi.fn().mockResolvedValue({ id: "rec-1" }),
        update: vi.fn().mockResolvedValue({}),
      },
      notification: {
        create: vi.fn().mockResolvedValue({}),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    } as any;

    await executePacket("packet-1", dbMock);

    expect(mockBrokerAdapter.submitOrder).toHaveBeenCalledWith({
      accountRef: { credentialId: "cred-1", environment: "paper", accountId: "acc-1" },
      symbol: "AAPL",
      side: "buy",
      quantity: 10,
      orderType: "market",
      limitPrice: undefined,
      clientOrderId: "pasa-order-1",
    });

    expect(mockBrokerAdapter.placeTrailingStop).toHaveBeenCalledWith({
      accountRef: { credentialId: "cred-1", environment: "paper", accountId: "acc-1" },
      symbol: "AAPL",
      quantity: 10,
      trailPercent: 5,
      clientOrderId: "stop-order-1",
    });

    expect(dbMock.orderRecord.create).toHaveBeenCalled();
    expect(dbMock.orderRecord.update).toHaveBeenCalledWith({
      where: { id: "rec-1" },
      data: {
        stopProtected: true,
        trailingStopOrderId: "b-stop-1",
      },
    });
    expect(dbMock.proposedOrderPacket.update).toHaveBeenCalledWith({
      where: { id: "packet-1" },
      data: { status: "EXECUTED" },
    });
  });

  it("handles trailing stop placement failure safely by marking position unprotected", async () => {
    mockValidateRiskForPacket.mockResolvedValue({
      packetStatus: "pass",
      orderResults: {},
    });

    mockGetBrokerAdapterForAccount.mockResolvedValue({
      adapter: mockBrokerAdapter,
      accountRef: { credentialId: "cred-1", environment: "paper", accountId: "acc-1" },
    });

    mockBrokerAdapter.getAccount.mockResolvedValue({ buyingPower: 10000 });
    mockBrokerAdapter.submitOrder.mockResolvedValue({
      brokerOrderId: "b-order-1",
      clientOrderId: "pasa-order-1",
      status: "filled",
      filledAt: new Date(),
      filledQty: 10,
      filledAvgPrice: 150,
      rejectedReason: null,
    });
    mockBrokerAdapter.placeTrailingStop.mockRejectedValue(new Error("Broker API reject"));

    const dbMock = {
      proposedOrderPacket: {
        findUnique: vi.fn().mockResolvedValue(mockPacket),
        update: vi.fn().mockResolvedValue({}),
      },
      proposedOrder: {
        update: vi.fn().mockResolvedValue({}),
      },
      orderRecord: {
        create: vi.fn().mockResolvedValue({ id: "rec-1" }),
        update: vi.fn().mockResolvedValue({}),
      },
      notification: {
        create: vi.fn().mockResolvedValue({}),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    } as any;

    await executePacket("packet-1", dbMock);

    expect(dbMock.orderRecord.update).toHaveBeenCalledWith({
      where: { id: "rec-1" },
      data: {
        stopProtected: false,
        stopPlacementError: "Broker API reject",
      },
    });

    expect(dbMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: "STOP_FAILURE",
          severity: "WARNING",
        }),
      }),
    );
  });
});
