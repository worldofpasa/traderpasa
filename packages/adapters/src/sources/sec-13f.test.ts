import { describe, it, expect, vi } from "vitest";
import { Sec13fSourceConnector, NOTABLE_MANAGERS } from "./sec-13f.js";

const MOCK_13F_SUBMISSIONS = {
  name: "BERKSHIRE HATHAWAY INC",
  filings: {
    recent: {
      accessionNumber: ["0000320193-23-000120", "0000320193-23-000100"],
      filingDate: ["2023-11-14", "2023-10-31"],
      reportDate: ["2023-09-30", "2023-09-30"],
      form: ["13F-HR", "8-K"],
      primaryDocument: ["form13f.xml", "aapl-8k.htm"],
      primaryDocDescription: ["Quarterly Holdings Report", "Current Report"],
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

describe("Sec13fSourceConnector", () => {
  it("testConnection returns ok=true on HTTP 200", async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeResponse(MOCK_13F_SUBMISSIONS));
    const connector = new Sec13fSourceConnector(undefined, fetchFn);

    const result = await connector.testConnection(null);

    expect(result.ok).toBe(true);
    expect(result.checkedAt).toBeInstanceOf(Date);
  });

  it("collect retrieves 13F-HR filings and computes reporting delay metadata", async () => {
    const fetchFn = vi.fn().mockImplementation((url: string) => {
      if (url.includes(`submissions/CIK${NOTABLE_MANAGERS[0]?.cik}.json`)) {
        return Promise.resolve(makeResponse(MOCK_13F_SUBMISSIONS));
      }
      return Promise.resolve(makeResponse({ name: "Other Manager", filings: { recent: { accessionNumber: [] } } }));
    });

    const connector = new Sec13fSourceConnector(undefined, fetchFn);
    const result = await connector.collect({ symbols: ["AAPL"], credentialRef: null });

    expect(result.status).toBe("succeeded");
    expect(result.items).toHaveLength(1);

    const filing = result.items[0];
    expect(filing).toBeDefined();
    expect(filing?.title).toBe("Berkshire Hathaway Inc Form 13F-HR Filing");
    expect(filing?.summary).toContain("Reporting delay: 45 days");
    expect(filing?.url).toBe("https://www.sec.gov/Archives/edgar/data/0001067983/000032019323000120/form13f.xml");
  });

  it("adds warning if filing delay exceeds 45 days", async () => {
    const mockLateSubmissions = {
      name: "BERKSHIRE HATHAWAY INC",
      filings: {
        recent: {
          accessionNumber: ["0000320193-23-000120"],
          filingDate: ["2023-11-20"],
          reportDate: ["2023-09-30"],
          form: ["13F-HR"],
          primaryDocument: ["form13f.xml"],
          primaryDocDescription: ["Quarterly Holdings Report"],
        },
      },
    };

    const fetchFn = vi.fn().mockImplementation((url: string) => {
      if (url.includes(`submissions/CIK${NOTABLE_MANAGERS[0]?.cik}.json`)) {
        return Promise.resolve(makeResponse(mockLateSubmissions));
      }
      return Promise.resolve(makeResponse({ name: "Other Manager", filings: { recent: { accessionNumber: [] } } }));
    });

    const connector = new Sec13fSourceConnector(undefined, fetchFn);
    const result = await connector.collect({ symbols: ["AAPL"], credentialRef: null });

    expect(result.items[0]?.warnings).toContain("Filing delay exceeds 45 days (51 days)");
  });
});
