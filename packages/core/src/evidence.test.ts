import { describe, it, expect, vi } from "vitest";
import { collectEvidenceForStrategy } from "./evidence.js";

vi.mock("@pasa-trader/adapters", () => {
  return {
    AlpacaMarketSourceConnector: class {
      id = "alpaca-market";
      reliabilityClass = "official_api";
      collect = vi.fn().mockResolvedValue({
        status: "succeeded",
        items: [
          {
            id: "item-1",
            sourceId: "alpaca-market",
            sourceName: "Alpaca",
            reliabilityClass: "official_api",
            status: "succeeded",
            observedAt: "2026-06-05T00:00:00Z",
            title: "Bar",
            summary: "Summary",
          },
        ],
      });
    },
    SecEdgarSourceConnector: class {
      id = "sec-edgar";
      reliabilityClass = "official_api";
      collect = vi.fn().mockResolvedValue({
        status: "failed",
        items: [],
      });
    },
    SecForm4SourceConnector: class {},
    Sec13fSourceConnector: class {},
    PoliticianTradesSourceConnector: class {},
  };
});

// Mock key for testing
process.env.CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32).toString("base64");

describe("collectEvidenceForStrategy", () => {
  const mockStrategy = {
    id: "strategy-1",
    userId: "user-1",
    symbols: ["AAPL"],
    status: "ENABLED",
    sourceConfig: {
      "alpaca-market": { enabled: true, required: true },
      "sec-edgar": { enabled: true, required: false },
    },
    brokerAccount: {
      credentialId: "cred-1",
    },
  };

  it("completes successfully and creates database records", async () => {
    const createdItems: any[] = [];
    let createdBundle: any = null;

    const txMock = {
      evidenceBundle: {
        create: vi.fn().mockImplementation(({ data }) => {
          createdBundle = { id: "bundle-1", ...data };
          return Promise.resolve(createdBundle);
        }),
        findUnique: vi.fn().mockImplementation(() => {
          return Promise.resolve({
            ...createdBundle,
            evidenceItems: createdItems,
          });
        }),
      },
      evidenceItem: {
        createMany: vi.fn().mockImplementation(({ data }) => {
          createdItems.push(...data);
          return Promise.resolve({ count: data.length });
        }),
      },
    };

    const dbMock = {
      strategyInstance: {
        findUnique: vi.fn().mockResolvedValue(mockStrategy),
      },
      credential: {
        findFirst: vi.fn().mockResolvedValue({
          iv: Buffer.alloc(12).toString("base64"),
          encryptedPayload: Buffer.alloc(16).toString("base64"),
          authTag: Buffer.alloc(16).toString("base64"),
          kind: "BROKER",
          provider: "alpaca",
        }),
      },
      $transaction: vi.fn().mockImplementation((cb) => cb(txMock)),
    } as any;

    const result = await collectEvidenceForStrategy("strategy-1", dbMock);

    expect(result.status).toBe("PARTIAL");
    expect(result.sourceResults).toEqual({
      "alpaca-market": "succeeded",
      "sec-edgar": "failed",
    });
  });

  it("fails the bundle if a required source fails", async () => {
    const mockStrategyWithRequiredFailure = {
      ...mockStrategy,
      sourceConfig: {
        "alpaca-market": { enabled: true, required: true },
        "sec-edgar": { enabled: true, required: true },
      },
    };

    let createdBundle: any = null;
    const txMock = {
      evidenceBundle: {
        create: vi.fn().mockImplementation(({ data }) => {
          createdBundle = { id: "bundle-1", ...data };
          return Promise.resolve(createdBundle);
        }),
        findUnique: vi.fn().mockImplementation(() => {
          return Promise.resolve({
            ...createdBundle,
            evidenceItems: [],
          });
        }),
      },
      evidenceItem: {
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };

    const dbMock = {
      strategyInstance: {
        findUnique: vi.fn().mockResolvedValue(mockStrategyWithRequiredFailure),
      },
      credential: {
        findFirst: vi.fn().mockResolvedValue({
          iv: Buffer.alloc(12).toString("base64"),
          encryptedPayload: Buffer.alloc(16).toString("base64"),
          authTag: Buffer.alloc(16).toString("base64"),
          kind: "BROKER",
          provider: "alpaca",
        }),
      },
      $transaction: vi.fn().mockImplementation((cb) => cb(txMock)),
    } as any;

    const result = await collectEvidenceForStrategy("strategy-1", dbMock);

    expect(result.status).toBe("FAILED");
  });
});
