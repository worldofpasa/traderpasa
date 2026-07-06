import type {
  BrokerAdapter,
  BrokerAccountRef,
  BrokerAccountSnapshot,
  BrokerAccountSummary,
  BrokerCapabilities,
  BrokerConnectionStatus,
  BrokerCredentialRef,
  BrokerOrderRequest,
  BrokerOrderResult,
  BrokerOrderSummary,
  TrailingStopRequest,
} from "../broker.js";
import type { BrokerageEnvironment } from "@pasa-trader/schemas";

const PAPER_BASE_URL = "https://paper-api.alpaca.markets";
const LIVE_BASE_URL = "https://api.alpaca.markets";

export interface AlpacaApiKeys {
  keyId: string;
  secretKey: string;
}

function baseUrl(environment: BrokerageEnvironment): string {
  return environment === "live" ? LIVE_BASE_URL : PAPER_BASE_URL;
}

function authHeaders(keys: AlpacaApiKeys): Record<string, string> {
  return {
    "APCA-API-KEY-ID": keys.keyId,
    "APCA-API-SECRET-KEY": keys.secretKey,
    "Content-Type": "application/json",
  };
}

type FetchFn = typeof fetch;

function mapAlpacaOrderStatus(status: string): BrokerOrderResult["status"] {
  switch (status) {
    case "filled":
      return "filled";
    case "partially_filled":
      return "partially_filled";
    case "canceled":
    case "cancelled":
    case "done_for_day":
    case "replaced":
      return "cancelled";
    case "expired":
      return "expired";
    case "rejected":
    case "stopped":
    case "suspended":
      return "rejected";
    case "new":
    case "accepted":
    case "pending_new":
    case "accepted_for_bidding":
    case "calculated":
      return "accepted";
    default:
      return "pending";
  }
}

export class AlpacaBrokerAdapter implements BrokerAdapter {
  readonly type = "alpaca";

  constructor(
    private readonly resolveKeys: (credentialId: string) => Promise<AlpacaApiKeys>,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  async testConnection(input: BrokerCredentialRef): Promise<BrokerConnectionStatus> {
    const checkedAt = new Date();
    try {
      const keys = await this.resolveKeys(input.credentialId);
      const res = await this.fetchFn(`${baseUrl(input.environment)}/v2/account`, {
        headers: authHeaders(keys),
      });
      if (res.ok) return { ok: true, message: "Connected", checkedAt };
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      return { ok: false, message: body.message ?? `HTTP ${res.status}`, checkedAt };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "Unknown error", checkedAt };
    }
  }

  async listAccounts(input: BrokerCredentialRef): Promise<BrokerAccountSummary[]> {
    const keys = await this.resolveKeys(input.credentialId);
    const res = await this.fetchFn(`${baseUrl(input.environment)}/v2/account`, {
      headers: authHeaders(keys),
    });
    if (!res.ok) throw new Error(`Alpaca listAccounts failed: HTTP ${res.status}`);
    const body = (await res.json()) as { id: string; status: string; currency: string };
    return [
      {
        accountId: body.id,
        environment: input.environment,
        currency: body.currency ?? "USD",
        status: body.status,
      },
    ];
  }

  async getAccount(input: BrokerAccountRef): Promise<BrokerAccountSnapshot> {
    const keys = await this.resolveKeys(input.credentialId);
    const res = await this.fetchFn(`${baseUrl(input.environment)}/v2/account`, {
      headers: authHeaders(keys),
    });
    if (!res.ok) throw new Error(`Alpaca getAccount failed: HTTP ${res.status}`);
    const body = (await res.json()) as {
      id: string;
      status: string;
      currency: string;
      buying_power: string;
      cash: string;
      portfolio_value: string;
      last_equity?: string;
      daytrade_count: number;
      pattern_day_trader: boolean;
    };
    const lastEquity = parseFloat(body.last_equity ?? "");
    return {
      accountId: body.id,
      environment: input.environment,
      currency: body.currency ?? "USD",
      status: body.status,
      buyingPower: parseFloat(body.buying_power ?? "0"),
      cash: parseFloat(body.cash ?? "0"),
      portfolioValue: parseFloat(body.portfolio_value ?? "0"),
      lastEquity: Number.isFinite(lastEquity) && lastEquity > 0 ? lastEquity : null,
      dayTradeCount: body.daytrade_count ?? null,
    };
  }

  async getCapabilities(input: BrokerAccountRef): Promise<BrokerCapabilities> {
    const keys = await this.resolveKeys(input.credentialId);
    const res = await this.fetchFn(`${baseUrl(input.environment)}/v2/account`, {
      headers: authHeaders(keys),
    });
    if (!res.ok) throw new Error(`Alpaca getCapabilities failed: HTTP ${res.status}`);
    const body = (await res.json()) as {
      shorting_enabled: boolean;
      options_trading_level?: number;
    };
    return {
      supportsShortSelling: body.shorting_enabled ?? false,
      supportsMarketOrders: true,
      supportsLimitOrders: true,
      supportsTrailingStops: true,
      maxOrdersPerDay: null,
    };
  }

  async submitOrder(input: BrokerOrderRequest): Promise<BrokerOrderResult> {
    const keys = await this.resolveKeys(input.accountRef.credentialId);
    const res = await this.fetchFn(`${baseUrl(input.accountRef.environment)}/v2/orders`, {
      method: "POST",
      headers: authHeaders(keys),
      body: JSON.stringify({
        symbol: input.symbol,
        qty: String(input.quantity),
        side: input.side === "sell_short" ? "sell" : input.side === "buy_to_cover" ? "buy" : input.side,
        type: input.orderType,
        time_in_force: "day",
        ...(input.orderType === "limit" && input.limitPrice !== undefined
          ? { limit_price: String(input.limitPrice) }
          : {}),
        client_order_id: input.clientOrderId,
      }),
    });
    const body = (await res.json()) as {
      id: string;
      client_order_id: string;
      status: string;
      filled_at?: string | null;
      filled_qty?: string | null;
      filled_avg_price?: string | null;
    };
    if (!res.ok) {
      return {
        brokerOrderId: body.id ?? "",
        clientOrderId: input.clientOrderId,
        status: "rejected",
        filledAt: null,
        filledQty: null,
        filledAvgPrice: null,
        rejectedReason: (body as { message?: string }).message ?? `HTTP ${res.status}`,
      };
    }
    return {
      brokerOrderId: body.id,
      clientOrderId: body.client_order_id,
      status: body.status as BrokerOrderResult["status"],
      filledAt: body.filled_at ? new Date(body.filled_at) : null,
      filledQty: body.filled_qty ? parseFloat(body.filled_qty) : null,
      filledAvgPrice: body.filled_avg_price ? parseFloat(body.filled_avg_price) : null,
      rejectedReason: null,
    };
  }

  async placeTrailingStop(input: TrailingStopRequest): Promise<BrokerOrderResult> {
    const keys = await this.resolveKeys(input.accountRef.credentialId);
    const res = await this.fetchFn(`${baseUrl(input.accountRef.environment)}/v2/orders`, {
      method: "POST",
      headers: authHeaders(keys),
      body: JSON.stringify({
        symbol: input.symbol,
        qty: String(input.quantity),
        side: "sell",
        type: "trailing_stop",
        time_in_force: "gtc",
        trail_percent: String(input.trailPercent),
        client_order_id: input.clientOrderId,
      }),
    });
    const body = (await res.json()) as {
      id: string;
      client_order_id: string;
      status: string;
    };
    if (!res.ok) {
      return {
        brokerOrderId: "",
        clientOrderId: input.clientOrderId,
        status: "rejected",
        filledAt: null,
        filledQty: null,
        filledAvgPrice: null,
        rejectedReason: (body as { message?: string }).message ?? `HTTP ${res.status}`,
      };
    }
    return {
      brokerOrderId: body.id,
      clientOrderId: body.client_order_id,
      status: body.status as BrokerOrderResult["status"],
      filledAt: null,
      filledQty: null,
      filledAvgPrice: null,
      rejectedReason: null,
    };
  }

  async getOrder(input: BrokerAccountRef, brokerOrderId: string): Promise<BrokerOrderResult> {
    const keys = await this.resolveKeys(input.credentialId);
    const res = await this.fetchFn(
      `${baseUrl(input.environment)}/v2/orders/${encodeURIComponent(brokerOrderId)}`,
      { headers: authHeaders(keys) },
    );
    if (!res.ok) throw new Error(`Alpaca getOrder failed: HTTP ${res.status}`);
    const body = (await res.json()) as {
      id: string;
      client_order_id: string;
      status: string;
      filled_at?: string | null;
      filled_qty?: string | null;
      filled_avg_price?: string | null;
    };
    return {
      brokerOrderId: body.id,
      clientOrderId: body.client_order_id,
      status: mapAlpacaOrderStatus(body.status),
      filledAt: body.filled_at ? new Date(body.filled_at) : null,
      filledQty: body.filled_qty ? parseFloat(body.filled_qty) : null,
      filledAvgPrice: body.filled_avg_price ? parseFloat(body.filled_avg_price) : null,
      rejectedReason: null,
    };
  }

  async listOpenOrders(input: BrokerAccountRef): Promise<BrokerOrderSummary[]> {
    const keys = await this.resolveKeys(input.credentialId);
    const res = await this.fetchFn(
      `${baseUrl(input.environment)}/v2/orders?status=open&limit=500`,
      { headers: authHeaders(keys) },
    );
    if (!res.ok) throw new Error(`Alpaca listOpenOrders failed: HTTP ${res.status}`);
    const body = (await res.json()) as Array<{
      id: string;
      symbol: string;
      side: string;
      qty: string;
      status: string;
      created_at: string;
    }>;
    return body.map((o) => ({
      brokerOrderId: o.id,
      symbol: o.symbol,
      side: o.side as BrokerOrderSummary["side"],
      qty: parseFloat(o.qty),
      status: o.status as BrokerOrderSummary["status"],
      createdAt: new Date(o.created_at),
    }));
  }
}
