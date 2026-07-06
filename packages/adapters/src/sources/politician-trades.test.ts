import { describe, it, expect, vi } from "vitest";
import { PoliticianTradesSourceConnector } from "./politician-trades.js";

const MOCK_TRANSACTIONS = [
  {
    transaction_date: "10/15/2023",
    ticker: "AAPL",
    senator: "Nancy Pelosi",
    type: "purchase",
    amount: "$1,001 - $15,000",
    ptr_link: "https://example.com/ptr",
  },
  {
    transaction_date: "10/15/2023",
    ticker: "MSFT",
    senator: "John Doe",
    type: "sale_full",
    amount: "$15,001 - $50,000",
    ptr_link: "https://example.com/ptr2",
  },
];

function makeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe("PoliticianTradesSourceConnector", () => {
  it("testConnection returns ok=true on HEAD request success", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
    const connector = new PoliticianTradesSourceConnector(undefined, fetchFn);

    const result = await connector.testConnection(null);

    expect(result.ok).toBe(true);
    expect(result.checkedAt).toBeInstanceOf(Date);
  });

  it("collect retrieves, filters and normalizes senator trades", async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeResponse(MOCK_TRANSACTIONS));
    const connector = new PoliticianTradesSourceConnector(undefined, fetchFn);

    const result = await connector.collect({ symbols: ["AAPL"], credentialRef: null });

    expect(result.status).toBe("succeeded");
    expect(result.items).toHaveLength(1);

    const trade = result.items[0];
    expect(trade).toBeDefined();
    expect(trade?.title).toBe("Politician Trade: Nancy Pelosi");
    expect(trade?.summary).toContain("Nancy Pelosi reported a trade of AAPL");
    expect(trade?.reliabilityClass).toBe("best_effort_scrape");
    expect(trade?.warnings).toContain("Politician trade data is best-effort scrape and may be incomplete or delayed.");
    expect(trade?.url).toBe("https://example.com/ptr");
  });

  it("collect handles case-insensitive symbols", async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeResponse(MOCK_TRANSACTIONS));
    const connector = new PoliticianTradesSourceConnector(undefined, fetchFn);

    const result = await connector.collect({ symbols: ["aapl", "msft"], credentialRef: null });

    expect(result.status).toBe("succeeded");
    expect(result.items).toHaveLength(2);
  });
});
