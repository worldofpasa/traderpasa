import type { BrokerageEnvironment } from "@pasa-trader/schemas";
import type {
  BrokerAccountRef,
  BrokerAccountSnapshot,
  BrokerAccountSummary,
  BrokerAdapter,
  BrokerCapabilities,
  BrokerConnectionStatus,
  BrokerCredentialRef,
  BrokerOrderRequest,
  BrokerOrderResult,
  BrokerOrderStatus,
  BrokerOrderSummary,
  TrailingStopRequest,
} from "../broker.js";

export interface IbkrApiCredentials {
  baseUrl: string;
  sessionToken?: string | undefined;
  paperAccountId?: string | undefined;
  liveAccountId?: string | undefined;
}

type FetchFn = typeof fetch;

const OPEN_ORDER_STATUSES = new Set(["Submitted", "PreSubmitted", "PendingSubmit", "PendingCancel", "Inactive"]);
const ORDER_STATUS_MAP: Record<string, BrokerOrderStatus> = {
  submitted: "accepted",
  presubmitted: "accepted",
  pending_submit: "pending",
  pending: "pending",
  filled: "filled",
  cancelled: "cancelled",
  canceled: "cancelled",
  rejected: "rejected",
  expired: "expired",
};

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function accountIdForEnvironment(credentials: IbkrApiCredentials, environment: BrokerageEnvironment): string | undefined {
  return environment === "paper" ? credentials.paperAccountId : credentials.liveAccountId;
}

function requestHeaders(credentials: IbkrApiCredentials): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(credentials.sessionToken ? { Cookie: `api=${credentials.sessionToken}` } : {}),
  };
}

function mapOrderStatus(status: string | undefined): BrokerOrderStatus {
  const normalized = status?.toLowerCase().replace(/\s+/g, "_") ?? "";
  return ORDER_STATUS_MAP[normalized] ?? "pending";
}

function readNumericValue(input: unknown): number {
  if (typeof input === "number") return input;
  if (typeof input === "string") {
    const parsed = Number.parseFloat(input);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof input === "object" && input !== null) {
    const record = input as Record<string, unknown>;
    return readNumericValue(record.amount ?? record.value ?? record.rawValue);
  }
  return 0;
}

function readSummaryValue(summary: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const direct = summary[key];
    if (direct !== undefined) return readNumericValue(direct);

    const matchingKey = Object.keys(summary).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
    if (matchingKey) return readNumericValue(summary[matchingKey]);
  }
  return 0;
}

function mapIbkrSide(side: BrokerOrderRequest["side"]): "BUY" | "SELL" {
  return side === "buy" || side === "buy_to_cover" ? "BUY" : "SELL";
}

function mapIbkrOrderType(orderType: BrokerOrderRequest["orderType"]): "MKT" | "LMT" {
  return orderType === "limit" ? "LMT" : "MKT";
}

function mapOpenOrderSide(side: string | undefined): BrokerOrderSummary["side"] {
  return side?.toUpperCase() === "BUY" ? "buy" : "sell";
}

function httpError(status: number): string {
  return `HTTP ${String(status)}`;
}

function stringValue(input: unknown): string | undefined {
  if (typeof input === "string") return input;
  if (typeof input === "number") return String(input);
  return undefined;
}

function firstResponseRecord(body: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(body)) return body[0] as Record<string, unknown> | undefined;
  if (typeof body === "object" && body !== null) return body as Record<string, unknown>;
  return undefined;
}

function promptMessageFromResponse(input: Record<string, unknown> | undefined): string | undefined {
  if (!input) return undefined;
  if (Array.isArray(input.message)) return input.message.map(stringValue).filter(Boolean).join(" ");
  return stringValue(input.message);
}

function buildOrderTicket(input: BrokerOrderRequest, accountId: string, conid: number): Record<string, unknown> {
  return {
    acctId: accountId,
    conid,
    side: mapIbkrSide(input.side),
    orderType: mapIbkrOrderType(input.orderType),
    tif: "DAY",
    quantity: input.quantity,
    cOID: input.clientOrderId,
    ...(input.orderType === "limit" && input.limitPrice !== undefined ? { price: input.limitPrice } : {}),
  };
}

function brokerOrderIdFromResponse(response: Record<string, unknown> | undefined): string {
  const candidate = response?.order_id ?? response?.orderId ?? response?.id;
  return stringValue(candidate) ?? "";
}

function orderStatusFromResponse(response: Record<string, unknown> | undefined): BrokerOrderStatus {
  const candidate = response?.order_status ?? response?.orderStatus ?? response?.status;
  return mapOrderStatus(stringValue(candidate));
}

function orderResultFromResponse(input: {
  clientOrderId: string;
  response: Record<string, unknown> | undefined;
}): BrokerOrderResult {
  return {
    brokerOrderId: brokerOrderIdFromResponse(input.response),
    clientOrderId: input.clientOrderId,
    status: orderStatusFromResponse(input.response),
    filledAt: null,
    filledQty: null,
    filledAvgPrice: null,
    rejectedReason: null,
  };
}

export class IbkrBrokerAdapter implements BrokerAdapter {
  readonly type = "ibkr";

  constructor(
    private readonly resolveCredentials: (credentialId: string) => Promise<IbkrApiCredentials>,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  async testConnection(input: BrokerCredentialRef): Promise<BrokerConnectionStatus> {
    const checkedAt = new Date();
    try {
      const credentials = await this.resolveCredentials(input.credentialId);
      const res = await this.fetchFn(`${this.baseUrl(credentials)}/tickle`, {
        headers: requestHeaders(credentials),
      });
      if (res.ok) return { ok: true, message: "Connected", checkedAt };
      const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      return { ok: false, message: body.message ?? body.error ?? httpError(res.status), checkedAt };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "Unknown error", checkedAt };
    }
  }

  async listAccounts(input: BrokerCredentialRef): Promise<BrokerAccountSummary[]> {
    const credentials = await this.resolveCredentials(input.credentialId);
    const configuredAccountId = accountIdForEnvironment(credentials, input.environment);
    if (configuredAccountId) {
      return [{
        accountId: configuredAccountId,
        environment: input.environment,
        currency: "USD",
        status: "CONFIGURED",
      }];
    }

    const res = await this.fetchFn(`${this.baseUrl(credentials)}/portfolio/accounts`, {
      headers: requestHeaders(credentials),
    });
    if (!res.ok) throw new Error(`IBKR listAccounts failed: ${httpError(res.status)}`);
    const body = (await res.json()) as {
      id?: string;
      accountId?: string;
      currency?: string;
      type?: string;
    }[];

    return body.map((account) => ({
      accountId: account.accountId ?? account.id ?? "",
      environment: input.environment,
      currency: account.currency ?? "USD",
      status: account.type ?? "AVAILABLE",
    })).filter((account) => account.accountId.length > 0);
  }

  async getAccount(input: BrokerAccountRef): Promise<BrokerAccountSnapshot> {
    const credentials = await this.resolveCredentials(input.credentialId);
    const accountId = this.resolveAccountId(input, credentials);
    const res = await this.fetchFn(`${this.baseUrl(credentials)}/portfolio/${encodeURIComponent(accountId)}/summary`, {
      headers: requestHeaders(credentials),
    });
    if (!res.ok) throw new Error(`IBKR getAccount failed: ${httpError(res.status)}`);
    const summary = (await res.json()) as Record<string, unknown>;
    const cash = readSummaryValue(summary, ["totalcashvalue", "cashbalance", "cash"]);
    const buyingPower = readSummaryValue(summary, ["buyingpower", "availablefunds"]);
    const portfolioValue = readSummaryValue(summary, ["netliquidation", "netliquidationvalue"]);
    const lastEquity = readSummaryValue(summary, ["previousdayequitywithloanvalue", "previousequity"]);

    return {
      accountId,
      environment: input.environment,
      currency: "USD",
      status: "ACTIVE",
      buyingPower,
      cash,
      portfolioValue,
      lastEquity: lastEquity > 0 ? lastEquity : null,
      dayTradeCount: null,
    };
  }

  async getCapabilities(input: BrokerAccountRef): Promise<BrokerCapabilities> {
    await this.getAccount(input);
    return {
      supportsShortSelling: true,
      supportsMarketOrders: true,
      supportsLimitOrders: true,
      supportsTrailingStops: false,
      maxOrdersPerDay: null,
    };
  }

  async submitOrder(input: BrokerOrderRequest): Promise<BrokerOrderResult> {
    const credentials = await this.resolveCredentials(input.accountRef.credentialId);
    const accountId = this.resolveAccountId(input.accountRef, credentials);
    const conid = await this.resolveStockConid(credentials, input.symbol);
    const res = await this.fetchFn(`${this.baseUrl(credentials)}/iserver/account/${encodeURIComponent(accountId)}/orders`, {
      method: "POST",
      headers: requestHeaders(credentials),
      body: JSON.stringify([buildOrderTicket(input, accountId, conid)]),
    });
    const body = (await res.json().catch(() => ([]))) as unknown;
    if (!res.ok) return this.rejectedOrder(input.clientOrderId, httpError(res.status));

    const first = firstResponseRecord(body);
    const promptMessage = promptMessageFromResponse(first);
    if (typeof promptMessage === "string" && promptMessage.length > 0) {
      return this.rejectedOrder(input.clientOrderId, promptMessage);
    }

    return orderResultFromResponse({ clientOrderId: input.clientOrderId, response: first });
  }

  placeTrailingStop(input: TrailingStopRequest): Promise<BrokerOrderResult> {
    return Promise.resolve(this.rejectedOrder(
      input.clientOrderId,
      "IBKR trailing stop placement is not enabled in this adapter yet.",
    ));
  }

  async listOpenOrders(input: BrokerAccountRef): Promise<BrokerOrderSummary[]> {
    const credentials = await this.resolveCredentials(input.credentialId);
    const accountId = this.resolveAccountId(input, credentials);
    const res = await this.fetchFn(`${this.baseUrl(credentials)}/iserver/account/orders`, {
      headers: requestHeaders(credentials),
    });
    if (!res.ok) throw new Error(`IBKR listOpenOrders failed: ${httpError(res.status)}`);
    const body = (await res.json()) as {
      orders?: {
        orderId?: string | number;
        acct?: string;
        account?: string;
        ticker?: string;
        symbol?: string;
        side?: string;
        remainingQuantity?: number;
        totalSize?: number;
        status?: string;
        order_time?: string;
      }[];
    };

    return (body.orders ?? [])
      .filter((order) => (order.acct ?? order.account ?? accountId) === accountId)
      .filter((order) => OPEN_ORDER_STATUSES.has(order.status ?? ""))
      .map((order) => ({
        brokerOrderId: String(order.orderId ?? ""),
        symbol: order.symbol ?? order.ticker ?? "",
        side: mapOpenOrderSide(order.side),
        qty: order.remainingQuantity ?? order.totalSize ?? 0,
        status: mapOrderStatus(order.status),
        createdAt: order.order_time ? new Date(order.order_time) : new Date(),
      }))
      .filter((order) => order.brokerOrderId.length > 0 && order.symbol.length > 0);
  }

  async getOrder(input: BrokerAccountRef, brokerOrderId: string): Promise<BrokerOrderResult> {
    const credentials = await this.resolveCredentials(input.credentialId);
    const res = await this.fetchFn(
      `${this.baseUrl(credentials)}/iserver/account/order/status/${encodeURIComponent(brokerOrderId)}`,
      { headers: requestHeaders(credentials) },
    );
    if (!res.ok) throw new Error(`IBKR getOrder failed: ${httpError(res.status)}`);
    const body = (await res.json()) as Record<string, unknown> & {
      order_status?: string;
      cum_fill?: number | string;
      average_price?: number | string;
    };
    const filledQtyRaw = Number(body.cum_fill ?? "");
    const avgPriceRaw = Number(body.average_price ?? "");
    return {
      brokerOrderId,
      clientOrderId: stringValue(body.cOID ?? body.order_ref) ?? "",
      status: orderStatusFromResponse(body),
      filledAt: null,
      filledQty: Number.isFinite(filledQtyRaw) && filledQtyRaw > 0 ? filledQtyRaw : null,
      filledAvgPrice: Number.isFinite(avgPriceRaw) && avgPriceRaw > 0 ? avgPriceRaw : null,
      rejectedReason: null,
    };
  }

  private async resolveStockConid(credentials: IbkrApiCredentials, symbol: string): Promise<number> {
    const params = new URLSearchParams({ symbol: symbol.toUpperCase(), name: "false", secType: "STK" });
    const res = await this.fetchFn(`${this.baseUrl(credentials)}/iserver/secdef/search?${params.toString()}`, {
      headers: requestHeaders(credentials),
    });
    if (!res.ok) throw new Error(`IBKR contract lookup failed for ${symbol}: ${httpError(res.status)}`);
    const body = (await res.json()) as {
      conid?: number | string;
      symbol?: string;
      secType?: string;
    }[];
    const match = body.find((contract) =>
      contract.symbol?.toUpperCase() === symbol.toUpperCase() &&
      (!contract.secType || contract.secType.toUpperCase() === "STK")
    ) ?? body[0];
    const conid = Number(match?.conid);
    if (!Number.isFinite(conid) || conid <= 0) {
      throw new Error(`IBKR contract lookup did not return a stock conid for ${symbol}.`);
    }
    return conid;
  }

  private resolveAccountId(input: BrokerAccountRef, credentials: IbkrApiCredentials): string {
    const configured = accountIdForEnvironment(credentials, input.environment);
    const accountId = input.accountId.length > 0 ? input.accountId : configured;
    if (!accountId) {
      throw new Error(`IBKR ${input.environment} account id is required.`);
    }
    return accountId;
  }

  private baseUrl(credentials: IbkrApiCredentials): string {
    return trimTrailingSlash(credentials.baseUrl);
  }

  private rejectedOrder(clientOrderId: string, rejectedReason: string): BrokerOrderResult {
    return {
      brokerOrderId: "",
      clientOrderId,
      status: "rejected",
      filledAt: null,
      filledQty: null,
      filledAvgPrice: null,
      rejectedReason,
    };
  }
}
