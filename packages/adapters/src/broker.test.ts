import { describe, it, expect, vi } from "vitest";
import type { BrokerAdapter } from "./broker.js";

function makeMockAdapter(): BrokerAdapter {
  return {
    type: "alpaca",
    testConnection: vi.fn().mockResolvedValue({ ok: true, message: "Connected", checkedAt: new Date() }),
    listAccounts: vi.fn().mockResolvedValue([
      { accountId: "acc-1", environment: "paper", currency: "USD", status: "ACTIVE" },
    ]),
    getAccount: vi.fn().mockResolvedValue({
      accountId: "acc-1",
      environment: "paper",
      currency: "USD",
      status: "ACTIVE",
      buyingPower: 10000,
      cash: 10000,
      portfolioValue: 10000,
      lastEquity: null,
      dayTradeCount: 0,
    }),
    getCapabilities: vi.fn().mockResolvedValue({
      supportsShortSelling: false,
      supportsMarketOrders: true,
      supportsLimitOrders: true,
      supportsTrailingStops: true,
      maxOrdersPerDay: null,
    }),
    submitOrder: vi.fn().mockResolvedValue({
      brokerOrderId: "broker-order-1",
      clientOrderId: "client-order-1",
      status: "accepted",
      filledAt: null,
      filledQty: null,
      filledAvgPrice: null,
      rejectedReason: null,
    }),
    placeTrailingStop: vi.fn().mockResolvedValue({
      brokerOrderId: "stop-order-1",
      clientOrderId: "stop-client-1",
      status: "accepted",
      filledAt: null,
      filledQty: null,
      filledAvgPrice: null,
      rejectedReason: null,
    }),
    listOpenOrders: vi.fn().mockResolvedValue([]),
    getOrder: vi.fn().mockResolvedValue({
      brokerOrderId: "broker-order-1",
      clientOrderId: "client-order-1",
      status: "filled",
      filledAt: new Date(),
      filledQty: 5,
      filledAvgPrice: 150,
      rejectedReason: null,
    }),
  };
}

const credRef = { credentialId: "cred-1", environment: "paper" as const };
const accountRef = { ...credRef, accountId: "acc-1" };

describe("BrokerAdapter contract", () => {
  it("testConnection returns ok status", async () => {
    const adapter = makeMockAdapter();
    const result = await adapter.testConnection(credRef);
    expect(result.ok).toBe(true);
    expect(result.checkedAt).toBeInstanceOf(Date);
  });

  it("listAccounts returns array with environment field", async () => {
    const adapter = makeMockAdapter();
    const accounts = await adapter.listAccounts(credRef);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.environment).toBe("paper");
  });

  it("getAccount returns snapshot with buyingPower", async () => {
    const adapter = makeMockAdapter();
    const snapshot = await adapter.getAccount(accountRef);
    expect(snapshot.buyingPower).toBeGreaterThanOrEqual(0);
    expect(snapshot.accountId).toBe("acc-1");
  });

  it("getCapabilities returns broker capability flags", async () => {
    const adapter = makeMockAdapter();
    const caps = await adapter.getCapabilities(accountRef);
    expect(typeof caps.supportsMarketOrders).toBe("boolean");
    expect(typeof caps.supportsShortSelling).toBe("boolean");
  });

  it("submitOrder returns brokerOrderId and clientOrderId", async () => {
    const adapter = makeMockAdapter();
    const result = await adapter.submitOrder({
      accountRef,
      symbol: "AAPL",
      side: "buy",
      quantity: 1,
      orderType: "market",
      clientOrderId: "client-order-1",
    });
    expect(result.brokerOrderId).toBeTruthy();
    expect(result.clientOrderId).toBe("client-order-1");
  });

  it("placeTrailingStop returns accepted result", async () => {
    const adapter = makeMockAdapter();
    const result = await adapter.placeTrailingStop({
      accountRef,
      symbol: "AAPL",
      quantity: 1,
      trailPercent: 2.5,
      clientOrderId: "stop-client-1",
    });
    expect(result.status).toBe("accepted");
  });

  it("listOpenOrders returns array", async () => {
    const adapter = makeMockAdapter();
    const orders = await adapter.listOpenOrders(accountRef);
    expect(Array.isArray(orders)).toBe(true);
  });
});
