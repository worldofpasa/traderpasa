import { describe, it, expect, vi } from "vitest";
import {
  runStrategyAgentWorkflow,
  MissingModelCredentialError,
  MissingLinkedAccountError,
  RequiredEvidenceFailedError,
} from "./agent-workflows.js";

vi.mock("@pasa-trader/adapters", () => {
  return {
    OpenAICompatibleModelAdapter: class {
      provider = "openai";
      generateStructured = vi.fn().mockImplementation((req) => {
        if (req.systemPrompt.includes("summarize")) {
          return Promise.resolve({
            output: { summary: "Research summary text", sourceWarnings: [], citations: ["item-1"] },
            usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10, model: "gpt-4", provider: "openai", durationMs: 50 },
          });
        }
        return Promise.resolve({
          output: {
            rationale: "Overall rationale",
            uncertaintyNote: "Low uncertainty",
            proposedOrders: [
              {
                symbol: "AAPL",
                side: "BUY",
                quantity: 100,
                orderType: "MARKET",
                rationale: "Signal is strong",
                evidenceItemIds: ["item-1"],
              },
            ],
          },
          usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20, model: "gpt-4", provider: "openai", durationMs: 50 },
        });
      });
    },
  };
});

process.env.CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32).toString("base64");

describe("runStrategyAgentWorkflow", () => {
  const mockStrategy = {
    id: "strategy-1",
    userId: "user-1",
    symbols: ["AAPL"],
    outputMode: "PROPOSED_ORDERS",
    executionMode: "PAPER",
    modelLoggingDepth: "METADATA",
    brokerAccountId: "acc-1",
  };

  const mockEvidenceBundle = {
    id: "bundle-1",
    status: "COMPLETE",
    evidenceItems: [
      {
        id: "item-1",
        sourceId: "alpaca",
        sourceName: "Alpaca",
        observedAt: new Date(),
        title: "News title",
        summary: "News summary text",
        warnings: [],
      },
    ],
  };

  it("successfully runs summarizer, generator, and creates database records", async () => {
    let createdPacket: any = null;
    const createdOrders: any[] = [];

    const txMock = {
      proposedOrderPacket: {
        create: vi.fn().mockImplementation(({ data }) => {
          createdPacket = { id: "packet-1", ...data };
          return Promise.resolve(createdPacket);
        }),
        findUnique: vi.fn().mockImplementation(() => {
          return Promise.resolve({
            ...createdPacket,
            proposedOrders: createdOrders,
          });
        }),
      },
      proposedOrder: {
        create: vi.fn().mockImplementation(({ data }) => {
          createdOrders.push({ id: "order-1", ...data });
          return Promise.resolve({ id: "order-1", ...data });
        }),
      },
    };

    const dbMock = {
      strategyInstance: {
        findUnique: vi.fn().mockResolvedValue(mockStrategy),
      },
      evidenceBundle: {
        findUnique: vi.fn().mockResolvedValue(mockEvidenceBundle),
      },
      credential: {
        findFirst: vi.fn().mockResolvedValue({
          iv: Buffer.alloc(12).toString("base64"),
          encryptedPayload: Buffer.alloc(16).toString("base64"),
          authTag: Buffer.alloc(16).toString("base64"),
          kind: "MODEL_PROVIDER",
          provider: "openai",
        }),
      },
      $transaction: vi.fn().mockImplementation((cb) => cb(txMock)),
    } as any;

    const result = await runStrategyAgentWorkflow("strategy-1", "bundle-1", dbMock);

    expect(result).not.toBeNull();
    expect(result!.status).toBe("DRAFT");
    expect(result!.rationale).toBe("Overall rationale");
    expect(result!.proposedOrders).toHaveLength(1);
    expect(result!.proposedOrders[0]!.symbol).toBe("AAPL");
    expect(result!.proposedOrders[0]!.quantity).toBe(100);
  });

  it("throws RequiredEvidenceFailedError if bundle status is FAILED", async () => {
    const dbMock = {
      strategyInstance: {
        findUnique: vi.fn().mockResolvedValue(mockStrategy),
      },
      evidenceBundle: {
        findUnique: vi.fn().mockResolvedValue({ ...mockEvidenceBundle, status: "FAILED" }),
      },
    } as any;

    await expect(runStrategyAgentWorkflow("strategy-1", "bundle-1", dbMock)).rejects.toThrow(
      RequiredEvidenceFailedError,
    );
  });

  it("throws MissingLinkedAccountError if strategy has no brokerAccountId", async () => {
    const dbMock = {
      strategyInstance: {
        findUnique: vi.fn().mockResolvedValue({ ...mockStrategy, brokerAccountId: null }),
      },
    } as any;

    await expect(runStrategyAgentWorkflow("strategy-1", "bundle-1", dbMock)).rejects.toThrow(
      MissingLinkedAccountError,
    );
  });

  it("throws MissingModelCredentialError if model credential not found", async () => {
    const dbMock = {
      strategyInstance: {
        findUnique: vi.fn().mockResolvedValue(mockStrategy),
      },
      evidenceBundle: {
        findUnique: vi.fn().mockResolvedValue(mockEvidenceBundle),
      },
      credential: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    } as any;

    await expect(runStrategyAgentWorkflow("strategy-1", "bundle-1", dbMock)).rejects.toThrow(
      MissingModelCredentialError,
    );
  });
});
