import { describe, it, expect, vi } from "vitest";
import { AlpacaMarketSourceConnector } from "./alpaca-market.js";

const MOCK_KEYS = { keyId: "PKTEST123", secretKey: "secret456" };
const resolveKeys = vi.fn().mockResolvedValue(MOCK_KEYS);

const CREDENTIAL_REF = { credentialId: "cred-1" };

function makeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe("AlpacaMarketSourceConnector", () => {
  it("testConnection returns ok=true on HTTP 200", async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeResponse({ id: "acc-1", status: "ACTIVE" }));
    const connector = new AlpacaMarketSourceConnector(resolveKeys, fetchFn);

    const result = await connector.testConnection(CREDENTIAL_REF);

    expect(result.ok).toBe(true);
    expect(result.checkedAt).toBeInstanceOf(Date);
    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringContaining("paper-api.alpaca.markets/v2/account"),
      expect.objectContaining({ headers: expect.objectContaining({ "APCA-API-KEY-ID": "PKTEST123" }) }),
    );
  });

  it("testConnection returns ok=false on HTTP 403", async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeResponse({ message: "forbidden" }, 403));
    const connector = new AlpacaMarketSourceConnector(resolveKeys, fetchFn);

    const result = await connector.testConnection(CREDENTIAL_REF);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("HTTP 403");
  });

  it("testConnection returns ok=false on network error", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const connector = new AlpacaMarketSourceConnector(resolveKeys, fetchFn);

    const result = await connector.testConnection(CREDENTIAL_REF);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("ECONNREFUSED");
  });

  it("testConnection returns ok=false when no credentials are provided", async () => {
    const connector = new AlpacaMarketSourceConnector(resolveKeys);
    const result = await connector.testConnection(null);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("credentials");
  });

  it("collect returns skipped when no credentials are provided", async () => {
    const connector = new AlpacaMarketSourceConnector(resolveKeys);
    const result = await connector.collect({ symbols: ["AAPL"], credentialRef: null });
    expect(result.status).toBe("skipped");
    expect(result.items).toHaveLength(0);
  });

  it("collect successfully fetches bars and news", async () => {
    const mockBars = {
      bars: {
        AAPL: {
          t: "2026-06-05T00:00:00Z",
          o: 150,
          h: 152,
          l: 149,
          c: 151,
          v: 1000000,
        },
      },
    };
    const mockNews = {
      news: [
        {
          id: 123,
          headline: "Apple did something",
          summary: "A summary",
          url: "https://example.com/news/123",
          created_at: "2026-06-05T00:00:00Z",
          symbols: ["AAPL"],
        },
      ],
    };

    const fetchFn = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/bars/latest")) {
        return Promise.resolve(makeResponse(mockBars));
      }
      if (url.includes("/news")) {
        return Promise.resolve(makeResponse(mockNews));
      }
      return Promise.resolve(makeResponse({}));
    });

    const connector = new AlpacaMarketSourceConnector(resolveKeys, fetchFn);
    const result = await connector.collect({ symbols: ["AAPL"], credentialRef: CREDENTIAL_REF });

    expect(result.status).toBe("succeeded");
    expect(result.items).toHaveLength(2);

    const barItem = result.items.find(i => i.id.includes("bar"));
    const newsItem = result.items.find(i => i.id.includes("news"));

    expect(barItem).toBeDefined();
    expect(barItem?.symbols).toEqual(["AAPL"]);
    expect(barItem?.title).toBe("AAPL latest price bar");
    expect(barItem?.summary).toContain("close=$151");

    expect(newsItem).toBeDefined();
    expect(newsItem?.symbols).toEqual(["AAPL"]);
    expect(newsItem?.title).toBe("Apple did something");
  });

  it("collect handles bar fetch failure gracefully and continues/returns partial", async () => {
    const mockNews = {
      news: [
        {
          id: 123,
          headline: "Apple did something",
          summary: "A summary",
          url: "https://example.com/news/123",
          created_at: "2026-06-05T00:00:00Z",
          symbols: ["AAPL"],
        },
      ],
    };

    const fetchFn = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/bars/latest")) {
        return Promise.resolve(makeResponse({}, 500)); // fail bars
      }
      if (url.includes("/news")) {
        return Promise.resolve(makeResponse(mockNews));
      }
      return Promise.resolve(makeResponse({}));
    });

    const connector = new AlpacaMarketSourceConnector(resolveKeys, fetchFn);
    const result = await connector.collect({ symbols: ["AAPL"], credentialRef: CREDENTIAL_REF });

    expect(result.status).toBe("succeeded"); // since we got news
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toContain("news");
  });

  it("collect returns failed when everything fails or throws", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("Network Failure"));
    const connector = new AlpacaMarketSourceConnector(resolveKeys, fetchFn);
    const result = await connector.collect({ symbols: ["AAPL"], credentialRef: CREDENTIAL_REF });

    expect(result.status).toBe("failed");
    expect(result.message).toContain("Network Failure");
    expect(result.items).toHaveLength(0);
  });
});
