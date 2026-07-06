import { getPrismaClient, type PrismaClient } from "@pasa-trader/db";
import { getBrokerAdapterForAccount } from "./broker-accounts.js";

export const MAX_STOP_RETRIES = 3;

export interface ProtectionRunResult {
  scanned: number;
  adopted: number;
  recovered: number;
  failed: number;
  escalated: number;
}

/**
 * Recovery pass for unprotected positions (#97).
 *
 * Scans FILLED entry orders (BUY / BUY_TO_COVER) whose strategy has a trailing
 * stop configured but whose stop placement failed. For each one it checks the
 * broker for an existing protective sell order (to prevent double-stopping),
 * otherwise retries placement. After MAX_STOP_RETRIES consecutive failures a
 * CRITICAL notification is raised and the record stops being retried.
 */
export async function recoverUnprotectedPositions(
  db: PrismaClient = getPrismaClient(),
): Promise<ProtectionRunResult> {
  const result: ProtectionRunResult = { scanned: 0, adopted: 0, recovered: 0, failed: 0, escalated: 0 };

  const records = await db.orderRecord.findMany({
    where: {
      side: { in: ["BUY", "BUY_TO_COVER"] },
      stopProtected: false,
      status: { in: ["FILLED", "PARTIAL_FILL"] },
      stopRetryCount: { lt: MAX_STOP_RETRIES },
    },
    include: {
      proposedOrder: {
        include: {
          packet: {
            include: { strategyInstance: true },
          },
        },
      },
    },
  });

  for (const record of records) {
    const strategy = record.proposedOrder.packet.strategyInstance;
    const stopConfig = strategy.trailingStopConfig as { trailPercent?: number } | null;

    // Strategies without a trailing stop configured are intentionally unprotected.
    if (!stopConfig?.trailPercent) continue;

    result.scanned += 1;

    try {
      const { adapter, accountRef } = await getBrokerAdapterForAccount(
        record.brokerAccountId,
        strategy.userId,
        db,
      );

      // Prevent double-stopping: adopt an existing open protective sell order.
      const openOrders = await adapter.listOpenOrders(accountRef);
      const existingStop = openOrders.find(
        (o) =>
          o.symbol.toUpperCase() === record.symbol.toUpperCase() &&
          o.side.toLowerCase() === "sell" &&
          o.qty === record.quantity,
      );

      if (existingStop) {
        await db.orderRecord.update({
          where: { id: record.id },
          data: {
            stopProtected: true,
            trailingStopOrderId: existingStop.brokerOrderId,
            stopPlacementError: null,
          },
        });
        await db.auditLog.create({
          data: {
            actorType: "SYSTEM",
            action: "order.stop_adopted",
            target: `order_record:${record.id}`,
            metadata: { trailingStopOrderId: existingStop.brokerOrderId },
          },
        });
        result.adopted += 1;
        continue;
      }

      const stopResult = await adapter.placeTrailingStop({
        accountRef,
        symbol: record.symbol,
        quantity: record.quantity,
        trailPercent: stopConfig.trailPercent,
        clientOrderId: `stop-${record.proposedOrderId}-r${record.stopRetryCount + 1}`,
      });

      if (stopResult.status === "rejected") {
        await registerStopRetryFailure(db, record, strategy, stopResult.rejectedReason || "Stop rejected by broker", result);
        continue;
      }

      await db.orderRecord.update({
        where: { id: record.id },
        data: {
          stopProtected: true,
          trailingStopOrderId: stopResult.brokerOrderId,
          stopPlacementError: null,
        },
      });
      await db.auditLog.create({
        data: {
          actorType: "SYSTEM",
          action: "order.stop_recovered",
          target: `order_record:${record.id}`,
          metadata: { trailingStopOrderId: stopResult.brokerOrderId, retry: record.stopRetryCount + 1 },
        },
      });
      await db.notification.create({
        data: {
          userId: strategy.userId,
          kind: "STOP_FAILURE",
          severity: "INFO",
          title: `Trailing Stop Recovered: ${record.symbol}`,
          message: `Protective trailing stop was successfully re-placed for ${record.quantity} shares of ${record.symbol}.`,
          strategyInstanceId: strategy.id,
          relatedId: record.id,
        },
      });
      result.recovered += 1;
    } catch (err) {
      await registerStopRetryFailure(
        db,
        record,
        strategy,
        err instanceof Error ? err.message : String(err),
        result,
      );
    }
  }

  return result;
}

async function registerStopRetryFailure(
  db: PrismaClient,
  record: { id: string; symbol: string; quantity: number; stopRetryCount: number },
  strategy: { id: string; userId: string },
  reason: string,
  result: ProtectionRunResult,
): Promise<void> {
  const retryCount = record.stopRetryCount + 1;
  await db.orderRecord.update({
    where: { id: record.id },
    data: {
      stopRetryCount: retryCount,
      stopPlacementError: reason,
    },
  });
  await db.auditLog.create({
    data: {
      actorType: "SYSTEM",
      action: "order.stop_retry_failed",
      target: `order_record:${record.id}`,
      metadata: { reason, retry: retryCount },
    },
  });
  result.failed += 1;

  if (retryCount >= MAX_STOP_RETRIES) {
    await db.notification.create({
      data: {
        userId: strategy.userId,
        kind: "STOP_FAILURE",
        severity: "CRITICAL",
        title: `Position Still Unprotected: ${record.symbol}`,
        message: `Trailing stop placement failed ${retryCount} consecutive times for ${record.quantity} shares of ${record.symbol}. Automatic retries have stopped — manual intervention required. Last error: ${reason}`,
        strategyInstanceId: strategy.id,
        relatedId: record.id,
      },
    });
    result.escalated += 1;
  }
}
