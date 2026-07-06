import { describe, it, expect, vi } from "vitest";
import { SecEdgarSourceConnector } from "./sec-edgar.js";

const MOCK_TICKERS = {
  "0": { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." },
};

const MOCK_SUBMISSIONS = {
  name: "Apple Inc.",
  filings: {
    recent: {
      accessionNumber: ["0000320193-23-000106", "0000320193-23-000100"],
      filingDate: ["2023-11-03", "2023-10-31"],
      reportDate: ["2023-09-30", "2023-09-30"],
      form: ["10-K", "8-K"],
      primaryDocument: ["aapl-20230930.htm", "aapl-8k.htm"],
      primaryDocDescription: ["Annual Report", "Current Report"],
    },
  },
};

function makeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe("SecEdgarSourceConnector", () => {
  it("testConnection returns ok=true on HTTP 200", async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeResponse(MOCK_TICKERS));
    const connector = new SecEdgarSourceConnector(undefined, fetchFn);

    const result = await connector.testConnection(null);

    expect(result.ok).toBe(true);
    expect(result.checkedAt).toBeInstanceOf(Date);
  });

  it("testConnection returns ok=false on HTTP 500", async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeResponse({}, 500));
    const connector = new SecEdgarSourceConnector(undefined, fetchFn);

    const result = await connector.testConnection(null);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("HTTP 500");
  });

  it("collect retrieves and normalizes 10-K and 8-K filings", async () => {
    const fetchFn = vi.fn().mockImplementation((url: string) => {
      if (url.includes("company_tickers.json")) {
        return Promise.resolve(makeResponse(MOCK_TICKERS));
      }
      if (url.includes("submissions/CIK0000320193.json")) {
        return Promise.resolve(makeResponse(MOCK_SUBMISSIONS));
      }
      return Promise.resolve(makeResponse({}));
    });

    const connector = new SecEdgarSourceConnector(undefined, fetchFn);
    const result = await connector.collect({ symbols: ["AAPL"], credentialRef: null });

    expect(result.status).toBe("succeeded");
    expect(result.items).toHaveLength(2);

    const tenK = result.items.find(i => i.title.includes("10-K"));
    expect(tenK).toBeDefined();
    expect(tenK?.observedAt).toBe(new Date("2023-11-03").toISOString());
    expect(tenK?.url).toBe("https://www.sec.gov/Archives/edgar/data/0000320193/000032019323000106/aapl-20230930.htm");
  });

  it("collect respects since parameter", async () => {
    const fetchFn = vi.fn().mockImplementation((url: string) => {
      if (url.includes("company_tickers.json")) {
        return Promise.resolve(makeResponse(MOCK_TICKERS));
      }
      if (url.includes("submissions/CIK0000320193.json")) {
        return Promise.resolve(makeResponse(MOCK_SUBMISSIONS));
      }
      return Promise.resolve(makeResponse({}));
    });

    const connector = new SecEdgarSourceConnector(undefined, fetchFn);
    const result = await connector.collect({
      symbols: ["AAPL"],
      credentialRef: null,
      since: new Date("2023-11-01").toISOString(),
    });

    expect(result.status).toBe("succeeded");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.title).toContain("10-K");
  });
});
