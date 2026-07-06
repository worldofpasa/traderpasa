# Asynchronous Order Status Syncing

Broker order fill cycles are asynchronous: limit orders can rest in the book for hours, fill partially, or be cancelled. `OrderRecord` statuses are kept in sync through two complementary paths (#90), both built on the shared transition logic in `packages/core/src/order-sync.ts`.

## 1. Fallback poller (`order.sync` worker task)

Runs every 5 minutes via the Graphile Worker crontab. It loads all `OrderRecord`s in a non-terminal state (`SUBMITTED`, `PARTIAL_FILL`) that have a `brokerOrderId`, fetches the current broker state through `BrokerAdapter.getOrder()` (implemented for Alpaca and IBKR), and applies any transition.

## 2. Alpaca webhook receiver (`POST /api/webhooks/alpaca`)

Real-time push path. Authenticated with a shared secret:

- Set `ALPACA_WEBHOOK_SECRET` in the environment and configure the same value in your event delivery integration; requests must send it in the `x-webhook-secret` header (constant-time comparison).
- When the variable is unset the endpoint is disabled and returns 404.
- Payloads are Zod-validated; the order is matched by broker order ID.

## Status mapping

| Broker status | OrderRecord status |
| --- | --- |
| `filled` | `FILLED` (fill price and timestamp recorded) |
| `partially_filled` | `PARTIAL_FILL` |
| `cancelled`, `expired` | `CANCELLED` |
| `rejected` | `REJECTED` |
| `accepted`, `pending` | no change |

## Observability

- Every transition writes an `order.status_synced` audit record with `from`/`to` states.
- Poller failures write `order.status_sync_failed` audit records.
- Terminal transitions notify the user: fills as INFO (`PAPER_EXECUTED`/`LIVE_EXECUTED` by environment), cancellations and rejections as WARNING (`EXECUTION_FAILURE`).
