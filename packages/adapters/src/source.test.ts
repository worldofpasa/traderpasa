import { describe, it, expect, vi } from "vitest";
import type { SourceConnector } from "./source.js";

function makeMockConnector(): SourceConnector {
  return {
    id: "alpaca-market",
    reliabilityClass: "official_api",
    testConnection: vi.fn().mockResolvedValue({ ok: true, message: "Connected", checkedAt: new Date() }),
    collect: vi.fn().mockResolvedValue({
      status: "succeeded",
      items: [
        {
          id: "item-1",
          sourceId: "alpaca-market",
          sourceName: "Alpaca Market Data",
          reliabilityClass: "official_api",
          status: "succeeded",
          observedAt: new Date().toISOString(),
          symbols: ["AAPL"],
          title: "AAPL price bar",
          summary: "Latest price bar for AAPL",
          warnings: [],
        },
      ],
      collectedAt: new Date(),
    }),
  };
}

describe("SourceConnector contract", () => {
  it("exposes id and reliabilityClass", () => {
    const connector = makeMockConnector();
    expect(connector.id).toBe("alpaca-market");
    expect(connector.reliabilityClass).toBe("official_api");
  });

  it("testConnection returns ok status with checkedAt", async () => {
    const connector = makeMockConnector();
    const result = await connector.testConnection(null);
    expect(result.ok).toBe(true);
    expect(result.checkedAt).toBeInstanceOf(Date);
  });

  it("collect returns items with required fields", async () => {
    const connector = makeMockConnector();
    const result = await connector.collect({ symbols: ["AAPL"], credentialRef: null });
    expect(result.status).toBe("succeeded");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.sourceId).toBe("alpaca-market");
    expect(result.items[0]?.symbols).toContain("AAPL");
  });

  it("collect returns failed status on error", async () => {
    const connector: SourceConnector = {
      ...makeMockConnector(),
      collect: vi.fn().mockResolvedValue({
        status: "failed",
        items: [],
        message: "API unavailable",
        collectedAt: new Date(),
      }),
    };
    const result = await connector.collect({ symbols: ["AAPL"], credentialRef: null });
    expect(result.status).toBe("failed");
    expect(result.items).toHaveLength(0);
    expect(result.message).toBeTruthy();
  });

  it("collect with credentialRef passes it through", async () => {
    const connector = makeMockConnector();
    await connector.collect({ symbols: ["TSLA"], credentialRef: { credentialId: "cred-1" } });
    expect(connector.collect).toHaveBeenCalledWith(
      expect.objectContaining({ credentialRef: { credentialId: "cred-1" } }),
    );
  });
});
