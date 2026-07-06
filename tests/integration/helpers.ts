import { randomUUID } from "node:crypto";
import { vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createEncryptedCredential } from "@pasa-trader/core";

process.env.CREDENTIAL_ENCRYPTION_KEY ??= Buffer.alloc(32).toString("base64");

export interface ScenarioOptions {
  executionMode?: "PAPER" | "LIVE";
  liveAcknowledged?: boolean;
  trailingStopPercent?: number;
  riskConfig?: Record<string, unknown>;
  orderQuantity?: number;
  limitPrice?: number;
}

export interface SeededScenario {
  userId: string;
  credentialId: string;
  brokerAccountId: string;
  strategyId: string;
  packetId: string;
  orderId: string;
}

/**
 * Seed a complete user → credential → broker account → strategy → packet
 * chain through the real Prisma client and credential encryption service.
 */
export async function seedScenario(db: PrismaClient, opts: ScenarioOptions = {}): Promise<SeededScenario> {
  const user = await db.user.create({
    data: {
      name: "Integration Tester",
      email: `int-${randomUUID()}@pasa.local`,
      passwordHash: "not-a-real-hash",
      role: "ADMIN",
    },
  });

  const { credential } = await createEncryptedCredential(
    {
      userId: user.id,
      kind: "BROKER",
      provider: "alpaca",
      label: "Integration Alpaca",
      secret: JSON.stringify({ keyId: "PKTEST-INT", secretKey: "int-secret" }),
    },
    db,
  );

  const account = await db.brokerAccount.create({
    data: {
      userId: user.id,
      credentialId: credential.id,
      provider: "alpaca",
      label: "Integration Paper Account",
      environment: opts.executionMode === "LIVE" ? "LIVE" : "PAPER",
      brokerAccountId: "acc-int-1",
      status: "CONNECTED",
    },
  });

  const template = await db.strategyTemplate.create({
    data: {
      kind: "MOMENTUM",
      name: "Integration Momentum",
      description: "Template seeded by integration tests.",
      defaultConfig: {},
    },
  });

  const strategy = await db.strategyInstance.create({
    data: {
      userId: user.id,
      templateId: template.id,
      brokerAccountId: account.id,
      name: "Integration Strategy",
      status: "ENABLED",
      symbols: ["AAPL"],
      sourceConfig: {},
      riskConfig: opts.riskConfig ?? {},
      outputMode: "PROPOSED_ORDERS",
      executionMode: opts.executionMode ?? "PAPER",
      ...(opts.liveAcknowledged ? { liveAcknowledgedAt: new Date() } : {}),
      ...(opts.trailingStopPercent ? { trailingStopConfig: { trailPercent: opts.trailingStopPercent } } : {}),
    },
  });

  const packet = await db.proposedOrderPacket.create({
    data: {
      strategyInstanceId: strategy.id,
      status: "DRAFT",
      rationale: "Integration test packet.",
    },
  });

  const order = await db.proposedOrder.create({
    data: {
      packetId: packet.id,
      symbol: "AAPL",
      side: "BUY",
      quantity: opts.orderQuantity ?? 5,
      orderType: "LIMIT",
      limitPrice: opts.limitPrice ?? 150,
      environment: opts.executionMode === "LIVE" ? "LIVE" : "PAPER",
      brokerAccountId: account.id,
      rationale: "Buy AAPL for integration test.",
    },
  });

  return {
    userId: user.id,
    credentialId: credential.id,
    brokerAccountId: account.id,
    strategyId: strategy.id,
    packetId: packet.id,
    orderId: order.id,
  };
}

export interface FakeAlpacaBehavior {
  buyingPower?: number;
  accountFails?: boolean;
  orderResponse?: "filled" | "accepted" | "rejected";
  stopResponse?: "accepted" | "rejected";
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Replace globalThis.fetch with a fake Alpaca paper API. Everything below the
 * HTTP boundary (adapters, risk engine, execution service, Prisma) runs real.
 */
export function installFakeAlpaca(behavior: FakeAlpacaBehavior = {}): { restore: () => void } {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);

    if (url.endsWith("/v2/account")) {
      if (behavior.accountFails) throw new Error("ECONNREFUSED: fake broker outage");
      return jsonResponse({
        id: "acc-int-1",
        status: "ACTIVE",
        currency: "USD",
        buying_power: String(behavior.buyingPower ?? 10000),
        cash: "10000",
        portfolio_value: "20000",
        last_equity: "20000",
        daytrade_count: 0,
        pattern_day_trader: false,
        shorting_enabled: true,
      });
    }

    if (url.includes("/v2/orders?status=open")) {
      return jsonResponse([]);
    }

    if (url.endsWith("/v2/orders") && init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as Record<string, string>;

      if (body.type === "trailing_stop") {
        if (behavior.stopResponse === "rejected") {
          return jsonResponse({ message: "trailing stop rejected by fake broker" }, 422);
        }
        return jsonResponse({ id: "stop-broker-1", client_order_id: body.client_order_id, status: "accepted" });
      }

      if (behavior.orderResponse === "rejected") {
        return jsonResponse({ message: "order rejected by fake broker" }, 422);
      }
      return jsonResponse({
        id: "order-broker-1",
        client_order_id: body.client_order_id,
        status: behavior.orderResponse ?? "filled",
        filled_at: "2026-06-10T14:30:00Z",
        filled_qty: body.qty,
        filled_avg_price: "150",
      });
    }

    throw new Error(`Unexpected fetch in fake Alpaca: ${url}`);
  }) as typeof fetch;

  return {
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}
