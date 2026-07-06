import type {
  BrokerageEnvironment,
  OrderSide,
  OrderType,
} from "@pasa-trader/schemas";

export interface BrokerCredentialRef {
  credentialId: string;
  environment: BrokerageEnvironment;
}

export interface BrokerAccountRef extends BrokerCredentialRef {
  accountId: string;
}

export interface BrokerConnectionStatus {
  ok: boolean;
  message: string;
  checkedAt: Date;
}

export interface BrokerAccountSummary {
  accountId: string;
  environment: BrokerageEnvironment;
  currency: string;
  status: string;
}

export interface BrokerAccountSnapshot {
  accountId: string;
  environment: BrokerageEnvironment;
  currency: string;
  status: string;
  buyingPower: number;
  cash: number;
  portfolioValue: number;
  /** Equity at the previous trading day close; null when the broker does not report it. */
  lastEquity: number | null;
  dayTradeCount: number | null;
}

export interface BrokerCapabilities {
  supportsShortSelling: boolean;
  supportsMarketOrders: boolean;
  supportsLimitOrders: boolean;
  supportsTrailingStops: boolean;
  maxOrdersPerDay: number | null;
}

export interface BrokerOrderRequest {
  accountRef: BrokerAccountRef;
  symbol: string;
  side: OrderSide;
  quantity: number;
  orderType: OrderType;
  limitPrice?: number;
  clientOrderId: string;
}

export interface TrailingStopRequest {
  accountRef: BrokerAccountRef;
  symbol: string;
  quantity: number;
  trailPercent: number;
  clientOrderId: string;
}

export type BrokerOrderStatus =
  | "accepted"
  | "pending"
  | "filled"
  | "partially_filled"
  | "cancelled"
  | "rejected"
  | "expired";

export interface BrokerOrderResult {
  brokerOrderId: string;
  clientOrderId: string;
  status: BrokerOrderStatus;
  filledAt: Date | null;
  filledQty: number | null;
  filledAvgPrice: number | null;
  rejectedReason: string | null;
}

export interface BrokerOrderSummary {
  brokerOrderId: string;
  symbol: string;
  side: OrderSide;
  qty: number;
  status: BrokerOrderStatus;
  createdAt: Date;
}

export interface BrokerAdapter {
  readonly type: string;
  testConnection(input: BrokerCredentialRef): Promise<BrokerConnectionStatus>;
  listAccounts(input: BrokerCredentialRef): Promise<BrokerAccountSummary[]>;
  getAccount(input: BrokerAccountRef): Promise<BrokerAccountSnapshot>;
  getCapabilities(input: BrokerAccountRef): Promise<BrokerCapabilities>;
  submitOrder(input: BrokerOrderRequest): Promise<BrokerOrderResult>;
  placeTrailingStop(input: TrailingStopRequest): Promise<BrokerOrderResult>;
  listOpenOrders(input: BrokerAccountRef): Promise<BrokerOrderSummary[]>;
  getOrder(input: BrokerAccountRef, brokerOrderId: string): Promise<BrokerOrderResult>;
}
