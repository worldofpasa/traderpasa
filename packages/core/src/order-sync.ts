import { getPrismaClient, type PrismaClient } from "@pasa-trader/db";
import { type BrokerOrderResult } from "@pasa-trader/adapters";
import { getBrokerAdapterForAccount } from "./broker-accounts.js";

export type OrderRecordSyncStatus = "SUBMITTED" | "FILLED" | "PARTIAL_FILL" | "CANCELLED" | "REJECTED" | "FAILED";

export interface OrderSyncResult {
  checked: number;
  updated: number;
  failed: number;
}

/** Map a broker order status onto the OrderRecord status enum. */
export function mapBrokerStatusToRecordStatus(status: BrokerOrderResult["status"]): OrderRecordSyncStatus {
  switch (status) {
    case "filled":
      return "FILLED";
    case "partially_filled":
      return "PARTIAL_FILL";
    case "cancelled":
    case "expired":
      return "CANCELLED";
    case "rejected":
      return "REJECTED";
    default:
      return "SUBMITTED";
  }
}

interface SyncableRecord {
  id: string;
  brokerOrderId: string | null;
  brokerAccountId: string;
  symbol: string;
  side: string;
  quantity: number;
  status: string;
  environment: string;
  proposedOrder: {
    packet: {
      strategyInstance: { id: string; userId: string };
    };
  };
}

/**
 * Apply a broker-reported status to a single order record. Shared by the
 * cron-based poller and the Alpaca webhook receiver (#90). No-ops when the
 * status is unchanged. Emits an audit record on every transition, and a
 * notification when the order reaches a terminal state.
 */
export async function applyOrderStatusUpdate(
  record: SyncableRecord,
  update: Pick<BrokerOrderResult, "status" | "filledAt" | "filledAvgPrice">,
  db: PrismaClient = getPrismaClient(),
): Promise<boolean> {
  const nextStatus = mapBrokerStatusToRecordStatus(update.status);
  if (nextStatus === record.status || nextStatus === "SUBMITTED") return false;

  const strategy = record.proposedOrder.packet.strategyInstance;

  await db.orderRecord.update({
    where: { id: record.id },
    data: {
      status: nextStatus,
      ...(update.filledAvgPrice ? { fillPrice: update.filledAvgPrice } : {}),
      ...(update.filledAt ? { filledAt: update.filledAt } : {}),
    },
  });

  await db.auditLog.create({
    data: {
      actorType: "SYSTEM",
      action: "order.status_synced",
      target: `order_record:${record.id}`,
      metadata: { from: record.status, to: nextStatus, brokerOrderId: record.brokerOrderId },
    },
  });

  if (nextStatus === "FILLED" || nextStatus === "CANCELLED" || nextStatus === "REJECTED") {
    const severity = nextStatus === "FILLED" ? "INFO" : "WARNING";
    await db.notification.create({
      data: {
        userId: strategy.userId,
        kind:
          nextStatus === "FILLED"
            ? record.environment === "LIVE"
              ? "LIVE_EXECUTED"
              : "PAPER_EXECUTED"
            : "EXECUTION_FAILURE",
        severity,
        title: `Order ${nextStatus === "FILLED" ? "Filled" : nextStatus === "CANCELLED" ? "Cancelled" : "Rejected"}: ${record.symbol}`,
        message: `Broker reports the ${record.side} order for ${record.quantity} shares of ${record.symbol} is now ${nextStatus}.`,
        strategyInstanceId: strategy.id,
        relatedId: record.id,
      },
    });
  }

  return true;
}

/**
 * Fallback poller for asynchronous order lifecycles (#90): fetches the broker
 * status of every non-terminal order record and applies transitions.
 */
export async function syncPendingOrderRecords(
  db: PrismaClient = getPrismaClient(),
): Promise<OrderSyncResult> {
  const result: OrderSyncResult = { checked: 0, updated: 0, failed: 0 };

  const records = (await db.orderRecord.findMany({
    where: {
      status: { in: ["SUBMITTED", "PARTIAL_FILL"] },
      brokerOrderId: { not: null },
    },
    include: {
      proposedOrder: {
        include: { packet: { include: { strategyInstance: true } } },
      },
    },
  })) as unknown as SyncableRecord[];

  for (const record of records) {
    if (!record.brokerOrderId) continue;
    result.checked += 1;
    try {
      const strategy = record.proposedOrder.packet.strategyInstance;
      const { adapter, accountRef } = await getBrokerAdapterForAccount(
        record.brokerAccountId,
        strategy.userId,
        db,
      );
      const brokerOrder = await adapter.getOrder(accountRef, record.brokerOrderId);
      const changed = await applyOrderStatusUpdate(record, brokerOrder, db);
      if (changed) result.updated += 1;
    } catch (err) {
      result.failed += 1;
      await db.auditLog.create({
        data: {
          actorType: "SYSTEM",
          action: "order.status_sync_failed",
          target: `order_record:${record.id}`,
          metadata: { error: err instanceof Error ? err.message : String(err) },
        },
      });
    }
  }

  return result;
}

/**
 * Webhook entry point: locate the order record by broker order ID and apply
 * the reported status. Returns false when the order is unknown.
 */
export async function applyWebhookOrderUpdate(
  brokerOrderId: string,
  update: Pick<BrokerOrderResult, "status" | "filledAt" | "filledAvgPrice">,
  db: PrismaClient = getPrismaClient(),
): Promise<boolean> {
  const record = (await db.orderRecord.findFirst({
    where: { brokerOrderId },
    include: {
      proposedOrder: {
        include: { packet: { include: { strategyInstance: true } } },
      },
    },
  })) as unknown as SyncableRecord | null;

  if (!record) return false;
  return applyOrderStatusUpdate(record, update, db);
}
