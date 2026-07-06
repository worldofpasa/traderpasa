import { describe, it, expect, vi } from "vitest";
import { SecForm4SourceConnector } from "./sec-form4.js";

const MOCK_TICKERS = {
  "0": { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." },
};

const MOCK_SUBMISSIONS = {
  name: "Apple Inc.",
  filings: {
    recent: {
      accessionNumber: ["0000320193-23-000110", "0000320193-23-000100"],
      filingDate: ["2023-11-05", "2023-10-31"],
      reportDate: ["2023-11-03", "2023-09-30"],
      form: ["4", "8-K"],
      primaryDocument: ["doc4.xml", "aapl-8k.htm"],
      primaryDocDescription: ["Statement of changes in beneficial ownership", "Current Report"],
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

describe("SecForm4SourceConnector", () => {
  it("testConnection returns ok=true on HTTP 200", async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeResponse(MOCK_TICKERS));
    const connector = new SecForm4SourceConnector(undefined, fetchFn);

    const result = await connector.testConnection(null);

    expect(result.ok).toBe(true);
    expect(result.checkedAt).toBeInstanceOf(Date);
  });

  it("collect retrieves and normalizes Form 4 filings, ignoring Form 8-K", async () => {
    const fetchFn = vi.fn().mockImplementation((url: string) => {
      if (url.includes("company_tickers.json")) {
        return Promise.resolve(makeResponse(MOCK_TICKERS));
      }
      if (url.includes("submissions/CIK0000320193.json")) {
        return Promise.resolve(makeResponse(MOCK_SUBMISSIONS));
      }
      return Promise.resolve(makeResponse({}));
    });

    const connector = new SecForm4SourceConnector(undefined, fetchFn);
    const result = await connector.collect({ symbols: ["AAPL"], credentialRef: null });

    expect(result.status).toBe("succeeded");
    expect(result.items).toHaveLength(1);

    const form4 = result.items[0];
    expect(form4).toBeDefined();
    expect(form4?.title).toBe("AAPL Insider Trade (Form 4)");
    expect(form4?.observedAt).toBe(new Date("2023-11-05").toISOString());
    expect(form4?.url).toBe("https://www.sec.gov/Archives/edgar/data/0000320193/000032019323000110/doc4.xml");
  });
});
