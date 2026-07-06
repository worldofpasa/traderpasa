import { describe, expect, it, vi } from "vitest";
import { IbkrBrokerAdapter } from "./ibkr-broker.js";

const MOCK_CREDENTIALS = {
  baseUrl: "https://localhost:5000/v1/api",
  paperAccountId: "DU123456",
  liveAccountId: "U123456",
};
const resolveCredentials = vi.fn().mockResolvedValue(MOCK_CREDENTIALS);
const PAPER_REF = { credentialId: "cred-1", environment: "paper" as const };
const PAPER_ACCOUNT_REF = { ...PAPER_REF, accountId: "DU123456" };

function makeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe("IbkrBrokerAdapter", () => {
  it("testConnection uses the Client Portal tickle endpoint", async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeResponse({ session: "abc" }));
    const adapter = new IbkrBrokerAdapter(resolveCredentials, fetchFn);

    const result = await adapter.testConnection(PAPER_REF);

    expect(result.ok).toBe(true);
    expect(fetchFn).toHaveBeenCalledWith(
      "https://localhost:5000/v1/api/tickle",
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  });

  it("returns configured paper account without probing account list", async () => {
    const fetchFn = vi.fn();
    const adapter = new IbkrBrokerAdapter(resolveCredentials, fetchFn);

    const accounts = await adapter.listAccounts(PAPER_REF);

    expect(accounts).toEqual([
      { accountId: "DU123456", environment: "paper", currency: "USD", status: "CONFIGURED" },
    ]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("maps account summary values into a snapshot", async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeResponse({
      buyingpower: { amount: 10000 },
      totalcashvalue: { amount: 9000 },
      netliquidation: { amount: 12000 },
    }));
    const adapter = new IbkrBrokerAdapter(resolveCredentials, fetchFn);

    const snapshot = await adapter.getAccount(PAPER_ACCOUNT_REF);

    expect(snapshot.buyingPower).toBe(10000);
    expect(snapshot.cash).toBe(9000);
    expect(snapshot.portfolioValue).toBe(12000);
  });

  it("submits market and limit orders with resolved stock conid", async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(makeResponse([{ conid: 265598, symbol: "AAPL", secType: "STK" }]))
      .mockResolvedValueOnce(makeResponse([{ order_id: "ibkr-order-1", order_status: "Submitted" }]));
    const adapter = new IbkrBrokerAdapter(resolveCredentials, fetchFn);

    const result = await adapter.submitOrder({
      accountRef: PAPER_ACCOUNT_REF,
      symbol: "AAPL",
      side: "buy",
      quantity: 10,
      orderType: "limit",
      limitPrice: 165,
      clientOrderId: "client-1",
    });

    expect(result.brokerOrderId).toBe("ibkr-order-1");
    expect(result.status).toBe("accepted");
    const submitted = fetchFn.mock.calls[1]?.[1] as { body: string };
    const body = JSON.parse(submitted.body) as Record<string, unknown>[];
    expect(body[0]).toMatchObject({
      acctId: "DU123456",
      conid: 265598,
      side: "BUY",
      orderType: "LMT",
      price: 165,
      quantity: 10,
      tif: "DAY",
      cOID: "client-1",
    });
  });

  it("rejects prompt-style order responses instead of auto-confirming", async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(makeResponse([{ conid: 265598, symbol: "AAPL", secType: "STK" }]))
      .mockResolvedValueOnce(makeResponse([{ id: "reply-1", message: ["Confirm order?"] }]));
    const adapter = new IbkrBrokerAdapter(resolveCredentials, fetchFn);

    const result = await adapter.submitOrder({
      accountRef: PAPER_ACCOUNT_REF,
      symbol: "AAPL",
      side: "buy",
      quantity: 1,
      orderType: "market",
      clientOrderId: "client-2",
    });

    expect(result.status).toBe("rejected");
    expect(result.rejectedReason).toContain("Confirm order");
  });

  it("maps open orders for duplicate detection", async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeResponse({
      orders: [{
        orderId: 123,
        account: "DU123456",
        ticker: "AAPL",
        side: "BUY",
        remainingQuantity: 3,
        status: "Submitted",
        order_time: "2026-06-06T12:00:00Z",
      }],
    }));
    const adapter = new IbkrBrokerAdapter(resolveCredentials, fetchFn);

    const orders = await adapter.listOpenOrders(PAPER_ACCOUNT_REF);

    expect(orders).toHaveLength(1);
    expect(orders[0]?.symbol).toBe("AAPL");
    expect(orders[0]?.side).toBe("buy");
    expect(orders[0]?.status).toBe("accepted");
  });
});
