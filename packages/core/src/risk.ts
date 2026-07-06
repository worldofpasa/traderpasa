import { getPrismaClient, type PrismaClient } from "@pasa-trader/db";
import { getBrokerAdapterForAccount } from "./broker-accounts.js";
import { type BrokerAccountSnapshot, type BrokerCapabilities, type BrokerOrderSummary } from "@pasa-trader/adapters";
import { type RiskCheck, type RiskResult, type RiskSeverity, type StrategyRiskConfig } from "@pasa-trader/schemas";

export async function validateRiskForPacket(
  packetId: string,
  db: PrismaClient = getPrismaClient(),
): Promise<{ packetStatus: RiskSeverity; orderResults: Record<string, RiskResult> }> {
  const packet = await db.proposedOrderPacket.findUnique({
    where: { id: packetId },
    include: {
      proposedOrders: true,
      strategyInstance: {
        include: { brokerAccount: true },
      },
    },
  });

  if (!packet) {
    throw new Error("Proposed order packet not found.");
  }

  const strategy = packet.strategyInstance;
  const proposedOrders = packet.proposedOrders;

  const orderResults: Record<string, RiskResult> = {};
  let overallPacketSeverity: RiskSeverity = "pass";

  // 1. Check required evidence failures at the packet level
  const evidenceChecks: RiskCheck[] = [];
  if (packet.evidenceBundleId) {
    const bundle = await db.evidenceBundle.findUnique({
      where: { id: packet.evidenceBundleId },
    });

    if (bundle) {
      const sourceConfig = strategy.sourceConfig as Record<string, { enabled: boolean; required: boolean }>;
      const sourceResults = bundle.sourceResults as Record<string, string>;

      for (const [sourceId, config] of Object.entries(sourceConfig || {})) {
        if (!config.enabled) continue;

        const resultStatus = sourceResults[sourceId];
        if (!resultStatus || resultStatus === "failed" || resultStatus === "skipped") {
          if (config.required) {
            evidenceChecks.push({
              code: "MISSING_REQUIRED_EVIDENCE",
              severity: "hard_block",
              message: `Required source connector "${sourceId}" failed or was skipped.`,
            });
          } else {
            evidenceChecks.push({
              code: "MISSING_OPTIONAL_EVIDENCE",
              severity: "warning",
              message: `Optional source connector "${sourceId}" failed or was skipped.`,
            });
          }
        }
      }
    }
  }

  // If there are broker configuration issues, we fail immediately with hard blocks
  if (!strategy.brokerAccountId) {
    const check: RiskCheck = {
      code: "NO_LINKED_ACCOUNT",
      severity: "hard_block",
      message: "Strategy instance does not have a linked broker account.",
    };
    for (const order of proposedOrders) {
      orderResults[order.id] = { status: "hard_block", checks: [check] };
    }
    return { packetStatus: "hard_block", orderResults };
  }

  // 2. Fetch broker snapshot & capabilities
  let snapshot: BrokerAccountSnapshot | null = null;
  let capabilities: BrokerCapabilities | null = null;
  let openOrders: BrokerOrderSummary[] = [];
  const brokerChecks: RiskCheck[] = [...evidenceChecks];

  try {
    const { adapter, accountRef } = await getBrokerAdapterForAccount(
      strategy.brokerAccountId,
      strategy.userId,
      db,
    );
    snapshot = await adapter.getAccount(accountRef);
    capabilities = await adapter.getCapabilities(accountRef);
    openOrders = await adapter.listOpenOrders(accountRef);
  } catch (err) {
    const check: RiskCheck = {
      code: "BROKER_OUTAGE",
      severity: "hard_block",
      message: `Failed to connect to broker API: ${err instanceof Error ? err.message : "Downtime detected"}`,
    };
    brokerChecks.push(check);
  }

  const riskConfig = (strategy.riskConfig ?? {}) as StrategyRiskConfig;

  // 2b. Account-level risk checks (computed once, applied per order)
  const accountChecks: RiskCheck[] = [];
  let dailyLossBreached = false;

  if (snapshot) {
    // Daily loss threshold: compare current NAV against previous close equity
    if (riskConfig.dailyLossThresholdPct) {
      if (snapshot.lastEquity && snapshot.lastEquity > 0) {
        const drawdownPct = ((snapshot.lastEquity - snapshot.portfolioValue) / snapshot.lastEquity) * 100;
        if (drawdownPct >= Number(riskConfig.dailyLossThresholdPct)) {
          dailyLossBreached = true;
        }
      } else {
        accountChecks.push({
          code: "DAILY_LOSS_UNKNOWN",
          severity: "warning",
          message: "dailyLossThresholdPct is configured but the broker did not report previous-close equity; daily loss check skipped.",
        });
      }
    }

    // Max executed orders per day (per strategy, UTC day boundary)
    if (riskConfig.maxOrdersPerDay) {
      const startOfDayUtc = new Date();
      startOfDayUtc.setUTCHours(0, 0, 0, 0);
      const executedToday = await db.proposedOrder.count({
        where: {
          status: "EXECUTED",
          updatedAt: { gte: startOfDayUtc },
          packet: { strategyInstanceId: strategy.id },
        },
      });
      if (executedToday >= Number(riskConfig.maxOrdersPerDay)) {
        accountChecks.push({
          code: "MAX_ORDERS_PER_DAY",
          severity: "hard_block",
          message: `Strategy has already executed ${executedToday} orders today (UTC), reaching the maxOrdersPerDay limit of ${riskConfig.maxOrdersPerDay}.`,
        });
      }
    }
  }

  // 3. Fetch active strategy conflicts
  let activeConflicts: string[] = [];
  try {
    const activeStrategies = await db.strategyInstance.findMany({
      where: {
        userId: strategy.userId,
        status: "ENABLED",
        id: { not: strategy.id },
      },
    });
    // Find all symbols other active strategies are trading
    activeConflicts = activeStrategies.flatMap((s) => s.symbols);
  } catch {
    // Ignore conflict fetch error
  }

  // 4. Validate each proposed order
  for (const order of proposedOrders) {
    const checks: RiskCheck[] = [...brokerChecks, ...accountChecks];
    const isEntryOrder = order.side === "BUY" || order.side === "SELL_SHORT";

    if (snapshot && capabilities) {
      // Daily loss threshold blocks new entries, but allows exits
      if (dailyLossBreached && isEntryOrder) {
        checks.push({
          code: "DAILY_LOSS_THRESHOLD",
          severity: "hard_block",
          message: `Account drawdown since previous close exceeds the dailyLossThresholdPct limit of ${riskConfig.dailyLossThresholdPct}%. Entry orders are blocked.`,
        });
      }

      // Whole-share check
      if (!Number.isInteger(order.quantity)) {
        checks.push({
          code: "NON_WHOLE_SHARE",
          severity: "hard_block",
          message: `Order quantity ${order.quantity} must be a whole share.`,
        });
      }

      // Broker capability checks
      if (order.side === "SELL_SHORT" && !capabilities.supportsShortSelling) {
        checks.push({
          code: "UNSUPPORTED_SHORTING",
          severity: "hard_block",
          message: "Short selling is not supported on this broker account.",
        });
      }

      if (order.orderType === "LIMIT" && !capabilities.supportsLimitOrders) {
        checks.push({
          code: "UNSUPPORTED_ORDER_TYPE",
          severity: "hard_block",
          message: "Limit orders are not supported on this broker account.",
        });
      }

      // Price estimation for buying power and exposure checks
      let estimatedPrice = order.limitPrice ? Number(order.limitPrice) : 0;
      if (estimatedPrice === 0 && packet.evidenceBundleId) {
        // Find close price of the symbol in the evidence items
        const items = await db.evidenceItem.findMany({
          where: { bundleId: packet.evidenceBundleId, symbols: { has: order.symbol } },
        });
        // Parse price from summary: "AAPL: open=$150 high=$152 low=$149 close=$151 volume=1000000"
        for (const item of items) {
          const match = item.summary.match(/close=\$([\d.]+)/);
          if (match && match[1]) {
            estimatedPrice = parseFloat(match[1]);
            break;
          }
        }
      }

      if (estimatedPrice === 0) {
        checks.push({
          code: "MISSING_PRICE_ESTIMATE",
          severity: "warning",
          message: `No price estimate available for ${order.symbol}. Buying power check skipped.`,
        });
      } else {
        const orderValue = order.quantity * estimatedPrice;

        // Buying power check
        if (orderValue > snapshot.buyingPower) {
          checks.push({
            code: "INSUFFICIENT_BUYING_POWER",
            severity: "hard_block",
            message: `Order value $${orderValue.toFixed(2)} exceeds available buying power $${snapshot.buyingPower.toFixed(2)}.`,
          });
        }

        // User risk settings check
        if (riskConfig.maxPositionPct) {
          const maxVal = (Number(riskConfig.maxPositionPct) / 100) * snapshot.portfolioValue;
          if (orderValue > maxVal) {
            checks.push({
              code: "MAX_POSITION_LIMIT",
              severity: "hard_block",
              message: `Order value $${orderValue.toFixed(2)} exceeds strategy max position limit of $${maxVal.toFixed(2)} (${riskConfig.maxPositionPct}% of portfolio).`,
            });
          }
        }

        // Account-wide exposure check: open positions plus this order must stay under the cap
        if (riskConfig.maxAccountExposurePct && isEntryOrder && snapshot.portfolioValue > 0) {
          const currentExposure = snapshot.portfolioValue - snapshot.cash;
          const projectedExposure = currentExposure + orderValue;
          const maxExposure = (Number(riskConfig.maxAccountExposurePct) / 100) * snapshot.portfolioValue;
          if (projectedExposure > maxExposure) {
            checks.push({
              code: "MAX_ACCOUNT_EXPOSURE",
              severity: "hard_block",
              message: `Projected account exposure $${projectedExposure.toFixed(2)} exceeds the maxAccountExposurePct limit of $${maxExposure.toFixed(2)} (${riskConfig.maxAccountExposurePct}% of portfolio).`,
            });
          }
        }

        if (riskConfig.restrictedTickers && Array.isArray(riskConfig.restrictedTickers)) {
          const restricted = riskConfig.restrictedTickers.map((t) => t.toUpperCase());
          if (restricted.includes(order.symbol.toUpperCase())) {
            checks.push({
              code: "RESTRICTED_TICKER",
              severity: "hard_block",
              message: `${order.symbol} is in the strategy restricted tickers list.`,
            });
          }
        }
      }

      // Duplicate order check
      const isDuplicate = openOrders.some(
        (o) =>
          o.symbol.toUpperCase() === order.symbol.toUpperCase() &&
          o.side.toLowerCase() === order.side.toLowerCase(),
      );
      if (isDuplicate) {
        checks.push({
          code: "DUPLICATE_ORDER",
          severity: "hard_block",
          message: `An open order for ${order.symbol} (${order.side}) already exists.`,
        });
      }

      // Conflict checks: opposite side trading in active strategies
      if (activeConflicts.includes(order.symbol.toUpperCase())) {
        checks.push({
          code: "STRATEGY_CONFLICT",
          severity: "hard_block",
          message: `Another active strategy is tracking or trading ${order.symbol}.`,
        });
      }
    }

    // Determine the status for this order
    let orderSeverity: RiskSeverity = "pass";
    if (checks.some((c) => c.severity === "hard_block")) {
      orderSeverity = "hard_block";
    } else if (checks.some((c) => c.severity === "warning")) {
      orderSeverity = "warning";
    }

    orderResults[order.id] = { status: orderSeverity, checks };

    // Update overall packet severity
    if (orderSeverity === "hard_block") {
      overallPacketSeverity = "hard_block";
    } else if (orderSeverity === "warning" && overallPacketSeverity === "pass") {
      overallPacketSeverity = "warning";
    }

    // Save result to DB
    await db.proposedOrder.update({
      where: { id: order.id },
      data: { riskResult: orderResults[order.id] as object },
    });
  }

  // Update proposed order packet status if there is a hard block
  if (overallPacketSeverity === "hard_block") {
    await db.proposedOrderPacket.update({
      where: { id: packetId },
      data: { status: "REJECTED" },
    });
  }

  return { packetStatus: overallPacketSeverity, orderResults };
}
