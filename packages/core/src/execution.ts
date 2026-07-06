import { getPrismaClient, type PrismaClient } from "@pasa-trader/db";
import { getBrokerAdapterForAccount } from "./broker-accounts.js";
import { validateRiskForPacket } from "./risk.js";
import { type BrokerAdapter, type BrokerAccountRef, type BrokerOrderRequest } from "@pasa-trader/adapters";

export class OrderExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderExecutionError";
  }
}

export async function executePacket(
  packetId: string,
  db: PrismaClient = getPrismaClient(),
): Promise<void> {
  const packet = await db.proposedOrderPacket.findUnique({
    where: { id: packetId },
    include: {
      proposedOrders: true,
      strategyInstance: {
        include: { user: true },
      },
    },
  });

  if (!packet) {
    throw new OrderExecutionError("Proposed order packet not found.");
  }

  if (packet.status === "EXECUTED" || packet.status === "REJECTED") {
    throw new OrderExecutionError(`Packet is already in a terminal state: ${packet.status}`);
  }

  const strategy = packet.strategyInstance;

  // 1. Enforce live-trading acknowledgment guards for LIVE mode
  if (strategy.executionMode === "LIVE") {
    if (!strategy.liveAcknowledgedAt) {
      await db.proposedOrderPacket.update({
        where: { id: packetId },
        data: { status: "REJECTED" },
      });
      await db.notification.create({
        data: {
          userId: strategy.userId,
          kind: "RISK_BLOCK",
          severity: "CRITICAL",
          title: "Live Trading Acknowledgment Required",
          message: `Strategy "${strategy.name}" is set to LIVE execution but has not been acknowledged. Execution blocked.`,
          strategyInstanceId: strategy.id,
          relatedId: packet.id,
        },
      });
      await db.auditLog.create({
        data: {
          actorType: "SYSTEM",
          action: "strategy.live_acknowledgment_missing",
          target: `strategy_instance:${strategy.id}`,
          metadata: { packetId },
        },
      });
      throw new OrderExecutionError("Live trading execution mode requires user acknowledgment.");
    }
  }

  // 2. Validate Risk
  const { packetStatus, orderResults } = await validateRiskForPacket(packetId, db);

  if (packetStatus === "hard_block") {
    // Rejected by risk engine
    await db.proposedOrderPacket.update({
      where: { id: packetId },
      data: { status: "REJECTED" },
    });

    // Mark proposed orders as rejected
    for (const order of packet.proposedOrders) {
      await db.proposedOrder.update({
        where: { id: order.id },
        data: { status: "REJECTED" },
      });
    }

    // Create Notification & Audit Log
    await db.notification.create({
      data: {
        userId: strategy.userId,
        kind: "RISK_BLOCK",
        severity: "CRITICAL",
        title: "Risk Engine Hard Block",
        message: `Proposed order packet rejected due to risk threshold violations for strategy "${strategy.name}".`,
        strategyInstanceId: strategy.id,
        relatedId: packet.id,
      },
    });

    await db.auditLog.create({
      data: {
        actorType: "SYSTEM",
        action: "strategy.risk_blocked",
        target: `proposed_order_packet:${packetId}`,
        metadata: { orderResults },
      },
    });

    throw new OrderExecutionError("Execution blocked by deterministic risk engine.");
  }

  // 3. Setup broker adapter and test connectivity/capabilities
  let adapter: BrokerAdapter;
  let accountRef: BrokerAccountRef;

  // We check brokerAccountId
  if (!strategy.brokerAccountId) {
    throw new OrderExecutionError("Strategy does not have a linked broker account.");
  }

  try {
    const res = await getBrokerAdapterForAccount(strategy.brokerAccountId, strategy.userId, db);
    adapter = res.adapter;
    accountRef = res.accountRef;

    // Check capability and simple ping
    await adapter.getAccount(accountRef);
  } catch (err) {
    // Broker Outage/Connection Error
    await db.proposedOrderPacket.update({
      where: { id: packetId },
      data: { status: "REJECTED" },
    });

    for (const order of packet.proposedOrders) {
      await db.proposedOrder.update({
        where: { id: order.id },
        data: { status: "REJECTED" },
      });
    }

    await db.notification.create({
      data: {
        userId: strategy.userId,
        kind: "BROKER_OUTAGE",
        severity: "CRITICAL",
        title: "Broker API Connection Outage",
        message: `Execution blocked due to broker connectivity failure: ${err instanceof Error ? err.message : "Downtime detected"}`,
        strategyInstanceId: strategy.id,
        relatedId: packet.id,
      },
    });

    await db.auditLog.create({
      data: {
        actorType: "SYSTEM",
        action: "broker.outage",
        target: `broker_account:${strategy.brokerAccountId}`,
        metadata: { error: err instanceof Error ? err.message : String(err) },
      },
    });

    throw new OrderExecutionError(`Broker connection failed: ${err instanceof Error ? err.message : "Outage"}`);
  }

  // 4. Submit each proposed order
  for (const order of packet.proposedOrders) {
    // Double check that the order environment matches strategy execution mode
    if (order.environment !== strategy.executionMode) {
      await db.proposedOrder.update({
        where: { id: order.id },
        data: { status: "REJECTED" },
      });
      continue;
    }

    const clientOrderId = `pasa-${order.id}`;

    try {
      const orderParams: BrokerOrderRequest = {
        accountRef,
        symbol: order.symbol,
        side: order.side.toLowerCase() as BrokerOrderRequest["side"],
        quantity: order.quantity,
        orderType: order.orderType.toLowerCase() as BrokerOrderRequest["orderType"],
        clientOrderId,
        ...(order.limitPrice !== null && order.limitPrice !== undefined && {
          limitPrice: Number(order.limitPrice),
        }),
      };
      const result = await adapter.submitOrder(orderParams);

      if (result.status === "rejected") {
        await db.proposedOrder.update({
          where: { id: order.id },
          data: { status: "REJECTED" },
        });

        await db.notification.create({
          data: {
            userId: strategy.userId,
            kind: "EXECUTION_FAILURE",
            severity: "CRITICAL",
            title: `Order Rejected by Broker: ${order.symbol}`,
            message: `Order to ${order.side} ${order.quantity} shares of ${order.symbol} was rejected: ${result.rejectedReason}`,
            strategyInstanceId: strategy.id,
            relatedId: order.id,
          },
        });

        await db.auditLog.create({
          data: {
            actorType: "SYSTEM",
            action: "order.rejected_by_broker",
            target: `proposed_order:${order.id}`,
            metadata: {
              result: {
                brokerOrderId: result.brokerOrderId,
                clientOrderId: result.clientOrderId,
                status: result.status,
                rejectedReason: result.rejectedReason,
              },
            },
          },
        });
        continue;
      }

      // Convert order record status
      let recordStatus: "SUBMITTED" | "FILLED" | "FAILED" = "SUBMITTED";
      if (result.status === "filled") {
        recordStatus = "FILLED";
      }

      // Create OrderRecord
      const record = await db.orderRecord.create({
        data: {
          proposedOrderId: order.id,
          brokerAccountId: strategy.brokerAccountId,
          brokerOrderId: result.brokerOrderId,
          symbol: order.symbol,
          side: order.side,
          quantity: order.quantity,
          orderType: order.orderType,
          limitPrice: order.limitPrice,
          fillPrice: result.filledAvgPrice ? Number(result.filledAvgPrice) : null,
          filledAt: result.filledAt,
          environment: order.environment,
          status: recordStatus,
        },
      });

      // Update proposed order status
      await db.proposedOrder.update({
        where: { id: order.id },
        data: { status: "EXECUTED" },
      });

      // Audit and notify success
      const notificationKind = order.environment === "LIVE" ? "LIVE_EXECUTED" : "PAPER_EXECUTED";
      await db.notification.create({
        data: {
          userId: strategy.userId,
          kind: notificationKind,
          severity: "INFO",
          title: `Order Executed (${order.environment})`,
          message: `Successfully executed ${order.side} order for ${order.quantity} shares of ${order.symbol}.`,
          strategyInstanceId: strategy.id,
          relatedId: record.id,
        },
      });

      await db.auditLog.create({
        data: {
          actorType: "SYSTEM",
          action: "order.executed",
          target: `order_record:${record.id}`,
          metadata: { brokerOrderId: result.brokerOrderId },
        },
      });

      // 5. Place Trailing Stop if configured
      const stopConfig = strategy.trailingStopConfig as { trailPercent?: number } | null;
      if (stopConfig && stopConfig.trailPercent) {
        // Trailing stop is typically a sell stop protecting a long position
        if (order.side === "BUY" || order.side === "BUY_TO_COVER") {
          const stopClientOrderId = `stop-${order.id}`;
          try {
            const stopResult = await adapter.placeTrailingStop({
              accountRef,
              symbol: order.symbol,
              quantity: order.quantity,
              trailPercent: stopConfig.trailPercent,
              clientOrderId: stopClientOrderId,
            });

            if (stopResult.status === "rejected") {
              await db.orderRecord.update({
                where: { id: record.id },
                data: {
                  stopProtected: false,
                  stopPlacementError: stopResult.rejectedReason || "Stop rejected by broker",
                },
              });

              await db.notification.create({
                data: {
                  userId: strategy.userId,
                  kind: "STOP_FAILURE",
                  severity: "WARNING",
                  title: `Trailing Stop Placement Failed: ${order.symbol}`,
                  message: `Position is unprotected. Trailing stop rejected: ${stopResult.rejectedReason}`,
                  strategyInstanceId: strategy.id,
                  relatedId: record.id,
                },
              });

              await db.auditLog.create({
                data: {
                  actorType: "SYSTEM",
                  action: "order.stop_placement_failed",
                  target: `order_record:${record.id}`,
                  metadata: { reason: stopResult.rejectedReason },
                },
              });
            } else {
              await db.orderRecord.update({
                where: { id: record.id },
                data: {
                  stopProtected: true,
                  trailingStopOrderId: stopResult.brokerOrderId,
                },
              });

              await db.auditLog.create({
                data: {
                  actorType: "SYSTEM",
                  action: "order.stop_placed",
                  target: `order_record:${record.id}`,
                  metadata: { trailingStopOrderId: stopResult.brokerOrderId },
                },
              });
            }
          } catch (stopErr) {
            await db.orderRecord.update({
              where: { id: record.id },
              data: {
                stopProtected: false,
                stopPlacementError: stopErr instanceof Error ? stopErr.message : String(stopErr),
              },
            });

            await db.notification.create({
              data: {
                userId: strategy.userId,
                kind: "STOP_FAILURE",
                severity: "WARNING",
                title: `Trailing Stop Placement Failed: ${order.symbol}`,
                message: `Position is unprotected. Error: ${stopErr instanceof Error ? stopErr.message : "Unknown error"}`,
                strategyInstanceId: strategy.id,
                relatedId: record.id,
              },
            });

            await db.auditLog.create({
              data: {
                actorType: "SYSTEM",
                action: "order.stop_placement_failed",
                target: `order_record:${record.id}`,
                metadata: { error: stopErr instanceof Error ? stopErr.message : String(stopErr) },
              },
            });
          }
        }
      }
    } catch (orderErr) {
      await db.proposedOrder.update({
        where: { id: order.id },
        data: { status: "REJECTED" },
      });

      await db.notification.create({
        data: {
          userId: strategy.userId,
          kind: "EXECUTION_FAILURE",
          severity: "CRITICAL",
          title: `Execution Failure: ${order.symbol}`,
          message: `Failed to execute ${order.side} ${order.quantity} shares of ${order.symbol}: ${orderErr instanceof Error ? orderErr.message : "Unknown error"}`,
          strategyInstanceId: strategy.id,
          relatedId: order.id,
        },
      });

      await db.auditLog.create({
        data: {
          actorType: "SYSTEM",
          action: "order.execution_failed",
          target: `proposed_order:${order.id}`,
          metadata: { error: orderErr instanceof Error ? orderErr.message : String(orderErr) },
        },
      });
    }
  }

  // Update proposed order packet status to EXECUTED
  await db.proposedOrderPacket.update({
    where: { id: packetId },
    data: { status: "EXECUTED" },
  });
}
