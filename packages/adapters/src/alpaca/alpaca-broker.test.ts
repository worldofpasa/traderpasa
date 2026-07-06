import { describe, it, expect, vi } from "vitest";
import { AlpacaBrokerAdapter } from "./alpaca-broker.js";

const MOCK_KEYS = { keyId: "PKTEST123", secretKey: "secret456" };
const resolveKeys = vi.fn().mockResolvedValue(MOCK_KEYS);

const PAPER_REF = { credentialId: "cred-1", environment: "paper" as const };
const PAPER_ACCOUNT_REF = { ...PAPER_REF, accountId: "acc-1" };

const ALPACA_ACCOUNT_FIXTURE = {
  id: "acc-1",
  status: "ACTIVE",
  currency: "USD",
  buying_power: "25000",
  cash: "25000",
  portfolio_value: "25000",
  last_equity: "24500",
  daytrade_count: 0,
  pattern_day_trader: false,
  shorting_enabled: false,
};

function makeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe("AlpacaBrokerAdapter", () => {
  it("testConnection returns ok=true on HTTP 200", async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeResponse(ALPACA_ACCOUNT_FIXTURE));
    const adapter = new AlpacaBrokerAdapter(resolveKeys, fetchFn);

    const result = await adapter.testConnection(PAPER_REF);

    expect(result.ok).toBe(true);
    expect(result.checkedAt).toBeInstanceOf(Date);
    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringContaining("paper-api.alpaca.markets/v2/account"),
      expect.objectContaining({ headers: expect.objectContaining({ "APCA-API-KEY-ID": "PKTEST123" }) }),
    );
  });

  it("testConnection returns ok=false on HTTP 403", async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeResponse({ message: "forbidden" }, 403));
    const adapter = new AlpacaBrokerAdapter(resolveKeys, fetchFn);

    const result = await adapter.testConnection(PAPER_REF);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("forbidden");
  });

  it("testConnection returns ok=false on network error", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const adapter = new AlpacaBrokerAdapter(resolveKeys, fetchFn);

    const result = await adapter.testConnection(PAPER_REF);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("ECONNREFUSED");
  });

  it("listAccounts returns one account from /v2/account", async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeResponse(ALPACA_ACCOUNT_FIXTURE));
    const adapter = new AlpacaBrokerAdapter(resolveKeys, fetchFn);

    const accounts = await adapter.listAccounts(PAPER_REF);

    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.accountId).toBe("acc-1");
    expect(accounts[0]?.environment).toBe("paper");
  });

  it("getAccount maps Alpaca snake_case fields correctly", async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeResponse(ALPACA_ACCOUNT_FIXTURE));
    const adapter = new AlpacaBrokerAdapter(resolveKeys, fetchFn);

    const snapshot = await adapter.getAccount(PAPER_ACCOUNT_REF);

    expect(snapshot.buyingPower).toBe(25000);
    expect(snapshot.cash).toBe(25000);
    expect(snapshot.portfolioValue).toBe(25000);
    expect(snapshot.lastEquity).toBe(24500);
    expect(snapshot.dayTradeCount).toBe(0);
  });

  it("getCapabilities reflects shorting_enabled flag", async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeResponse({ ...ALPACA_ACCOUNT_FIXTURE, shorting_enabled: true }));
    const adapter = new AlpacaBrokerAdapter(resolveKeys, fetchFn);

    const caps = await adapter.getCapabilities(PAPER_ACCOUNT_REF);

    expect(caps.supportsShortSelling).toBe(true);
    expect(caps.supportsMarketOrders).toBe(true);
    expect(caps.supportsTrailingStops).toBe(true);
  });

  it("submitOrder maps buy side and returns accepted result", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      makeResponse({ id: "order-1", client_order_id: "c-1", status: "accepted", filled_at: null, filled_qty: null, filled_avg_price: null }),
    );
    const adapter = new AlpacaBrokerAdapter(resolveKeys, fetchFn);

    const result = await adapter.submitOrder({
      accountRef: PAPER_ACCOUNT_REF,
      symbol: "AAPL",
      side: "buy",
      quantity: 5,
      orderType: "market",
      clientOrderId: "c-1",
    });

    expect(result.brokerOrderId).toBe("order-1");
    expect(result.status).toBe("accepted");
    expect(result.rejectedReason).toBeNull();
    const submitted = fetchFn.mock.calls[0]?.[1] as { body: string };
    const body = JSON.parse(submitted.body) as { side: string; qty: string };
    expect(body.side).toBe("buy");
    expect(body.qty).toBe("5");
  });

  it("submitOrder returns rejected on HTTP 422", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      makeResponse({ id: "", message: "insufficient funds" }, 422),
    );
    const adapter = new AlpacaBrokerAdapter(resolveKeys, fetchFn);

    const result = await adapter.submitOrder({
      accountRef: PAPER_ACCOUNT_REF,
      symbol: "AAPL",
      side: "buy",
      quantity: 1000,
      orderType: "market",
      clientOrderId: "c-2",
    });

    expect(result.status).toBe("rejected");
    expect(result.rejectedReason).toContain("insufficient");
  });

  it("placeTrailingStop posts to /v2/orders with trailing_stop type", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      makeResponse({ id: "stop-1", client_order_id: "stop-c-1", status: "accepted" }),
    );
    const adapter = new AlpacaBrokerAdapter(resolveKeys, fetchFn);

    const result = await adapter.placeTrailingStop({
      accountRef: PAPER_ACCOUNT_REF,
      symbol: "AAPL",
      quantity: 5,
      trailPercent: 2.5,
      clientOrderId: "stop-c-1",
    });

    expect(result.status).toBe("accepted");
    const submitted = fetchFn.mock.calls[0]?.[1] as { body: string };
    const body = JSON.parse(submitted.body) as { type: string; trail_percent: string };
    expect(body.type).toBe("trailing_stop");
    expect(body.trail_percent).toBe("2.5");
  });

  it("listOpenOrders returns mapped order summaries", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      makeResponse([
        { id: "o-1", symbol: "AAPL", side: "buy", qty: "3", status: "accepted", created_at: "2026-06-04T10:00:00Z" },
      ]),
    );
    const adapter = new AlpacaBrokerAdapter(resolveKeys, fetchFn);

    const orders = await adapter.listOpenOrders(PAPER_ACCOUNT_REF);

    expect(orders).toHaveLength(1);
    expect(orders[0]?.symbol).toBe("AAPL");
    expect(orders[0]?.qty).toBe(3);
    expect(orders[0]?.createdAt).toBeInstanceOf(Date);
  });

  it("uses live base URL when environment is live", async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeResponse(ALPACA_ACCOUNT_FIXTURE));
    const adapter = new AlpacaBrokerAdapter(resolveKeys, fetchFn);

    await adapter.testConnection({ credentialId: "cred-1", environment: "live" });

    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringContaining("api.alpaca.markets/v2/account"),
      expect.anything(),
    );
  });
});
