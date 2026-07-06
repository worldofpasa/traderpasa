import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  syncPendingOrderRecords,
  applyWebhookOrderUpdate,
  mapBrokerStatusToRecordStatus,
} from "./order-sync.js";
import { getBrokerAdapterForAccount } from "./broker-accounts.js";

vi.mock("./broker-accounts.js", () => ({
  getBrokerAdapterForAccount: vi.fn(),
}));

process.env.CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32).toString("base64");

const mockStrategy = { id: "strategy-1", userId: "user-1" };

function makeRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "record-1",
    brokerOrderId: "broker-1",
    brokerAccountId: "acc-1",
    symbol: "AAPL",
    side: "BUY",
    quantity: 5,
    status: "SUBMITTED",
    environment: "PAPER",
    proposedOrder: { packet: { strategyInstance: mockStrategy } },
    ...overrides,
  };
}

function makeDbMock(records: unknown[]) {
  return {
    orderRecord: {
      findMany: vi.fn().mockResolvedValue(records),
      findFirst: vi.fn().mockResolvedValue(records[0] ?? null),
      update: vi.fn().mockResolvedValue({}),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    notification: { create: vi.fn().mockResolvedValue({}) },
  } as any;
}

function mockAdapterGetOrder(result: Record<string, unknown>) {
  vi.mocked(getBrokerAdapterForAccount).mockResolvedValue({
    adapter: {
      type: "alpaca",
      getOrder: vi.fn().mockResolvedValue({
        brokerOrderId: "broker-1",
        clientOrderId: "client-1",
        filledAt: null,
        filledQty: null,
        filledAvgPrice: null,
        rejectedReason: null,
        ...result,
      }),
    },
    accountRef: { credentialId: "cred-1", environment: "paper", accountId: "acc-1" },
  } as any);
}

beforeEach(() => {
  vi.mocked(getBrokerAdapterForAccount).mockReset();
});

describe("mapBrokerStatusToRecordStatus", () => {
  it("maps broker statuses onto OrderRecord statuses", () => {
    expect(mapBrokerStatusToRecordStatus("filled")).toBe("FILLED");
    expect(mapBrokerStatusToRecordStatus("partially_filled")).toBe("PARTIAL_FILL");
    expect(mapBrokerStatusToRecordStatus("cancelled")).toBe("CANCELLED");
    expect(mapBrokerStatusToRecordStatus("expired")).toBe("CANCELLED");
    expect(mapBrokerStatusToRecordStatus("rejected")).toBe("REJECTED");
    expect(mapBrokerStatusToRecordStatus("accepted")).toBe("SUBMITTED");
    expect(mapBrokerStatusToRecordStatus("pending")).toBe("SUBMITTED");
  });
});

describe("syncPendingOrderRecords", () => {
  it("updates a SUBMITTED record to FILLED with fill details and notifies", async () => {
    const filledAt = new Date("2026-06-09T15:30:00Z");
    mockAdapterGetOrder({ status: "filled", filledAt, filledAvgPrice: 151.25 });
    const dbMock = makeDbMock([makeRecord()]);

    const result = await syncPendingOrderRecords(dbMock);

    expect(result).toEqual({ checked: 1, updated: 1, failed: 0 });
    expect(dbMock.orderRecord.update).toHaveBeenCalledWith({
      where: { id: "record-1" },
      data: { status: "FILLED", fillPrice: 151.25, filledAt },
    });
    const audit = dbMock.auditLog.create.mock.calls[0][0].data;
    expect(audit.action).toBe("order.status_synced");
    expect(audit.metadata).toMatchObject({ from: "SUBMITTED", to: "FILLED" });
    const notification = dbMock.notification.create.mock.calls[0][0].data;
    expect(notification.kind).toBe("PAPER_EXECUTED");
    expect(notification.severity).toBe("INFO");
  });

  it("uses LIVE_EXECUTED notification kind for live fills", async () => {
    mockAdapterGetOrder({ status: "filled" });
    const dbMock = makeDbMock([makeRecord({ environment: "LIVE" })]);

    await syncPendingOrderRecords(dbMock);

    const notification = dbMock.notification.create.mock.calls[0][0].data;
    expect(notification.kind).toBe("LIVE_EXECUTED");
  });

  it("transitions to CANCELLED with a WARNING notification", async () => {
    mockAdapterGetOrder({ status: "cancelled" });
    const dbMock = makeDbMock([makeRecord()]);

    const result = await syncPendingOrderRecords(dbMock);

    expect(result.updated).toBe(1);
    expect(dbMock.orderRecord.update).toHaveBeenCalledWith({
      where: { id: "record-1" },
      data: { status: "CANCELLED" },
    });
    const notification = dbMock.notification.create.mock.calls[0][0].data;
    expect(notification.severity).toBe("WARNING");
  });

  it("does not touch records whose broker status is unchanged", async () => {
    mockAdapterGetOrder({ status: "accepted" });
    const dbMock = makeDbMock([makeRecord()]);

    const result = await syncPendingOrderRecords(dbMock);

    expect(result).toEqual({ checked: 1, updated: 0, failed: 0 });
    expect(dbMock.orderRecord.update).not.toHaveBeenCalled();
    expect(dbMock.notification.create).not.toHaveBeenCalled();
  });

  it("records an audit entry when the broker lookup fails", async () => {
    vi.mocked(getBrokerAdapterForAccount).mockRejectedValue(new Error("broker down"));
    const dbMock = makeDbMock([makeRecord()]);

    const result = await syncPendingOrderRecords(dbMock);

    expect(result).toEqual({ checked: 1, updated: 0, failed: 1 });
    const audit = dbMock.auditLog.create.mock.calls[0][0].data;
    expect(audit.action).toBe("order.status_sync_failed");
  });

  it("only queries non-terminal records with a broker order id", async () => {
    const dbMock = makeDbMock([]);

    await syncPendingOrderRecords(dbMock);

    expect(dbMock.orderRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: { in: ["SUBMITTED", "PARTIAL_FILL"] },
          brokerOrderId: { not: null },
        },
      }),
    );
  });
});

describe("applyWebhookOrderUpdate", () => {
  it("applies an update to the record matching the broker order id", async () => {
    const dbMock = makeDbMock([makeRecord()]);

    const updated = await applyWebhookOrderUpdate(
      "broker-1",
      { status: "filled", filledAt: null, filledAvgPrice: 150 },
      dbMock,
    );

    expect(updated).toBe(true);
    expect(dbMock.orderRecord.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { brokerOrderId: "broker-1" } }),
    );
    expect(dbMock.orderRecord.update).toHaveBeenCalledWith({
      where: { id: "record-1" },
      data: { status: "FILLED", fillPrice: 150 },
    });
  });

  it("returns false for unknown broker order ids", async () => {
    const dbMock = makeDbMock([]);

    const updated = await applyWebhookOrderUpdate(
      "missing",
      { status: "filled", filledAt: null, filledAvgPrice: null },
      dbMock,
    );

    expect(updated).toBe(false);
    expect(dbMock.orderRecord.update).not.toHaveBeenCalled();
  });
});
