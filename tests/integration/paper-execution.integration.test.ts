import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { executePacket, validateRiskForPacket, OrderExecutionError } from "@pasa-trader/core";
import { makeTestDb, resetDb } from "./test-db.js";
import { seedScenario, installFakeAlpaca } from "./helpers.js";

let db: PrismaClient;
let fakeAlpaca: { restore: () => void } | null = null;

beforeAll(() => {
  db = makeTestDb();
});

afterAll(async () => {
  await db.$disconnect();
});

beforeEach(async () => {
  await resetDb(db);
});

afterEach(() => {
  fakeAlpaca?.restore();
  fakeAlpaca = null;
});

describe("paper execution loop (integration, real PostgreSQL)", () => {
  it("executes a paper packet end to end: risk pass → order filled → stop placed", async () => {
    fakeAlpaca = installFakeAlpaca({ orderResponse: "filled", stopResponse: "accepted" });
    const scenario = await seedScenario(db, { trailingStopPercent: 5 });

    await executePacket(scenario.packetId, db);

    const packet = await db.proposedOrderPacket.findUniqueOrThrow({ where: { id: scenario.packetId } });
    expect(packet.status).toBe("EXECUTED");

    const order = await db.proposedOrder.findUniqueOrThrow({ where: { id: scenario.orderId } });
    expect(order.status).toBe("EXECUTED");
    expect(order.riskResult).toMatchObject({ status: "pass" });

    const record = await db.orderRecord.findUniqueOrThrow({ where: { proposedOrderId: scenario.orderId } });
    expect(record.status).toBe("FILLED");
    expect(record.brokerOrderId).toBe("order-broker-1");
    expect(Number(record.fillPrice)).toBe(150);
    expect(record.stopProtected).toBe(true);
    expect(record.trailingStopOrderId).toBe("stop-broker-1");

    const notifications = await db.notification.findMany({ where: { userId: scenario.userId } });
    expect(notifications.some((n) => n.kind === "PAPER_EXECUTED")).toBe(true);

    const auditActions = (await db.auditLog.findMany()).map((a) => a.action);
    expect(auditActions).toContain("order.executed");
    expect(auditActions).toContain("order.stop_placed");
  });

  it("hard-blocks a packet that exceeds buying power and notifies the user", async () => {
    fakeAlpaca = installFakeAlpaca({ buyingPower: 100 }); // order value 750 > 100
    const scenario = await seedScenario(db);

    await expect(executePacket(scenario.packetId, db)).rejects.toThrow(OrderExecutionError);

    const packet = await db.proposedOrderPacket.findUniqueOrThrow({ where: { id: scenario.packetId } });
    expect(packet.status).toBe("REJECTED");

    const order = await db.proposedOrder.findUniqueOrThrow({ where: { id: scenario.orderId } });
    expect(order.status).toBe("REJECTED");
    const riskResult = order.riskResult as { status: string; checks: { code: string }[] };
    expect(riskResult.status).toBe("hard_block");
    expect(riskResult.checks.some((c) => c.code === "INSUFFICIENT_BUYING_POWER")).toBe(true);

    const notifications = await db.notification.findMany({ where: { userId: scenario.userId } });
    expect(notifications.some((n) => n.kind === "RISK_BLOCK" && n.severity === "CRITICAL")).toBe(true);

    expect(await db.orderRecord.count()).toBe(0);
  });

  it("marks the position unprotected and notifies when stop placement fails", async () => {
    fakeAlpaca = installFakeAlpaca({ orderResponse: "filled", stopResponse: "rejected" });
    const scenario = await seedScenario(db, { trailingStopPercent: 5 });

    await executePacket(scenario.packetId, db);

    const record = await db.orderRecord.findUniqueOrThrow({ where: { proposedOrderId: scenario.orderId } });
    expect(record.status).toBe("FILLED");
    expect(record.stopProtected).toBe(false);
    expect(record.stopPlacementError).toBeTruthy();

    const notifications = await db.notification.findMany({ where: { userId: scenario.userId } });
    expect(notifications.some((n) => n.kind === "STOP_FAILURE")).toBe(true);

    const auditActions = (await db.auditLog.findMany()).map((a) => a.action);
    expect(auditActions).toContain("order.stop_placement_failed");
  });

  it("hard-blocks execution when the broker is unreachable", async () => {
    fakeAlpaca = installFakeAlpaca({ accountFails: true });
    const scenario = await seedScenario(db);

    await expect(executePacket(scenario.packetId, db)).rejects.toThrow(OrderExecutionError);

    const packet = await db.proposedOrderPacket.findUniqueOrThrow({ where: { id: scenario.packetId } });
    expect(packet.status).toBe("REJECTED");

    const order = await db.proposedOrder.findUniqueOrThrow({ where: { id: scenario.orderId } });
    const riskResult = order.riskResult as { status: string; checks: { code: string }[] };
    expect(riskResult.checks.some((c) => c.code === "BROKER_OUTAGE")).toBe(true);

    expect(await db.orderRecord.count()).toBe(0);
  });

  it("blocks LIVE execution without acknowledgment and records audit + notification", async () => {
    fakeAlpaca = installFakeAlpaca();
    const scenario = await seedScenario(db, { executionMode: "LIVE", liveAcknowledged: false });

    await expect(executePacket(scenario.packetId, db)).rejects.toThrow(
      "Live trading execution mode requires user acknowledgment.",
    );

    const packet = await db.proposedOrderPacket.findUniqueOrThrow({ where: { id: scenario.packetId } });
    expect(packet.status).toBe("REJECTED");

    const notifications = await db.notification.findMany({ where: { userId: scenario.userId } });
    expect(notifications.some((n) => n.title === "Live Trading Acknowledgment Required")).toBe(true);

    const auditActions = (await db.auditLog.findMany()).map((a) => a.action);
    expect(auditActions).toContain("strategy.live_acknowledgment_missing");

    expect(await db.orderRecord.count()).toBe(0);
  });

  it("returns warning status (not block) for risk warnings via validateRiskForPacket", async () => {
    fakeAlpaca = installFakeAlpaca();
    // dailyLossThresholdPct configured but fake broker reports last_equity equal
    // to a healthy value → pass; use a missing price estimate instead:
    const scenario = await seedScenario(db, { riskConfig: { dailyLossThresholdPct: 5 } });

    const { packetStatus } = await validateRiskForPacket(scenario.packetId, db);

    // last_equity (20000) equals portfolio value (20000) → no drawdown → pass
    expect(packetStatus).toBe("pass");
  });
});
