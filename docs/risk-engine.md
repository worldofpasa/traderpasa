# Deterministic Risk Engine

The risk engine (`packages/core/src/risk.ts`, entry point `validateRiskForPacket`) validates every proposed order packet before execution. It is deterministic: no model output participates in any decision. Hard blocks cannot be overridden.

## Severities

- `pass` — no findings.
- `warning` — surfaced to the user; execution is allowed.
- `hard_block` — execution is blocked; the packet is marked `REJECTED`.

## Packet-level checks

| Code | Severity | Condition |
| --- | --- | --- |
| `MISSING_REQUIRED_EVIDENCE` | hard_block | A required source connector failed or was skipped for the evidence bundle. |
| `MISSING_OPTIONAL_EVIDENCE` | warning | An optional source connector failed or was skipped. |
| `NO_LINKED_ACCOUNT` | hard_block | Strategy has no linked broker account. |
| `BROKER_OUTAGE` | hard_block | Broker account snapshot/capabilities could not be fetched. |

## Account-level checks (strategy `riskConfig`)

| Code | Severity | Condition |
| --- | --- | --- |
| `MAX_ORDERS_PER_DAY` | hard_block | Strategy has already executed `maxOrdersPerDay` orders today (UTC day boundary, counted from `ProposedOrder` records with status `EXECUTED`). |
| `DAILY_LOSS_THRESHOLD` | hard_block (entry orders only) | Account drawdown since previous close — `(lastEquity − portfolioValue) / lastEquity` — meets or exceeds `dailyLossThresholdPct`. Exit (`SELL`) orders are still allowed. |
| `DAILY_LOSS_UNKNOWN` | warning | `dailyLossThresholdPct` is configured but the broker does not report previous-close equity (`lastEquity` is null). |

`lastEquity` comes from the broker snapshot: Alpaca maps `last_equity`; IBKR maps `previousdayequitywithloanvalue` when available, otherwise null.

## Per-order checks

| Code | Severity | Condition |
| --- | --- | --- |
| `NON_WHOLE_SHARE` | hard_block | Quantity is not a whole share. |
| `UNSUPPORTED_SHORTING` | hard_block | `SELL_SHORT` on an account without short selling. |
| `UNSUPPORTED_ORDER_TYPE` | hard_block | `LIMIT` order on an account without limit order support. |
| `MISSING_PRICE_ESTIMATE` | warning | No limit price and no close price in evidence; value-based checks are skipped. |
| `INSUFFICIENT_BUYING_POWER` | hard_block | Estimated order value exceeds buying power. |
| `MAX_POSITION_LIMIT` | hard_block | Order value exceeds `maxPositionPct` of portfolio value. |
| `MAX_ACCOUNT_EXPOSURE` | hard_block (entry orders only) | Current invested exposure (`portfolioValue − cash`) plus this order's value exceeds `maxAccountExposurePct` of portfolio value. |
| `RESTRICTED_TICKER` | hard_block | Symbol is in the strategy's `restrictedTickers` list. |
| `DUPLICATE_ORDER` | hard_block | An open broker order already exists for the same symbol and side. |
| `STRATEGY_CONFLICT` | hard_block | Another enabled strategy tracks the same symbol. |

## `riskConfig` schema

Defined in `packages/schemas/src/schemas.ts` (`strategyRiskConfigSchema`):

```ts
{
  maxPositionPct?: number;          // 0–100, per-order cap as % of portfolio
  maxAccountExposurePct?: number;   // 0–100, total invested exposure cap
  maxOrdersPerDay?: number;         // executed-order count limit per UTC day
  dailyLossThresholdPct?: number;   // 0–100, drawdown vs previous close that halts entries
  restrictedTickers?: string[];
}
```

Entry orders are `BUY` and `SELL_SHORT`; `SELL` is treated as an exit and is never blocked by exposure or daily-loss rules.

## Stop protection recovery worker

When a trailing stop fails to place after an entry fill, the position is flagged unprotected (`OrderRecord.stopProtected = false`, `stopPlacementError` set) and the user is notified. The `position.protect` Graphile Worker task (`packages/core/src/position-protection.ts`, scheduled every 10 minutes via the worker crontab) then:

1. Scans `FILLED`/`PARTIAL_FILL` entry orders (`BUY`, `BUY_TO_COVER`) with `stopProtected = false` whose strategy has `trailingStopConfig.trailPercent` set and `stopRetryCount < 3`.
2. Checks the broker's open orders for an existing protective sell of the same symbol/quantity — if found, it is adopted (no double-stopping).
3. Otherwise retries `placeTrailingStop` with a retry-suffixed client order ID.
4. On failure, increments `stopRetryCount`; after 3 consecutive failures it raises a CRITICAL `STOP_FAILURE` notification and stops retrying — manual intervention is required.

All transitions are written to the append-only audit log (`order.stop_adopted`, `order.stop_recovered`, `order.stop_retry_failed`).
