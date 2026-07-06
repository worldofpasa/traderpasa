import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  EvidenceSummarizerStep,
  OrderGenerationStep,
  AgentWorkflowExecutor,
} from "./index.js";
import { generateWithRepair } from "./runtime.js";
import { z } from "zod";

const mockModelAdapter = {
  provider: "openai",
  testConnection: vi.fn(),
  generateStructured: vi.fn(),
};

const mockCredentialRef = {
  credentialId: "cred-1",
  provider: "openai",
};

const mockContext = {
  modelAdapter: mockModelAdapter,
  credentialRef: mockCredentialRef,
  loggingDepth: "METADATA" as const,
  userId: "user-1",
};

describe("generateWithRepair", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns output immediately on successful generation", async () => {
    mockModelAdapter.generateStructured.mockResolvedValueOnce({
      output: { value: "success" },
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, model: "gpt-4", provider: "openai", durationMs: 100 },
    });

    const schema = z.object({ value: z.string() });
    const res = await generateWithRepair(mockContext, "sys", "user", schema);

    expect(res).toEqual({ value: "success" });
    expect(mockModelAdapter.generateStructured).toHaveBeenCalledTimes(1);
  });

  it("triggers repair and succeeds on second attempt if first attempt throws", async () => {
    mockModelAdapter.generateStructured
      .mockRejectedValueOnce(new Error("Zod parsing error"))
      .mockResolvedValueOnce({
        output: { value: "repaired" },
        usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30, model: "gpt-4", provider: "openai", durationMs: 150 },
      });

    const schema = z.object({ value: z.string() });
    const res = await generateWithRepair(mockContext, "sys", "user", schema);

    expect(res).toEqual({ value: "repaired" });
    expect(mockModelAdapter.generateStructured).toHaveBeenCalledTimes(2);
  });

  it("throws after repair attempt fails twice", async () => {
    mockModelAdapter.generateStructured
      .mockRejectedValueOnce(new Error("First Error"))
      .mockRejectedValueOnce(new Error("Second Error"));

    const schema = z.object({ value: z.string() });
    await expect(generateWithRepair(mockContext, "sys", "user", schema)).rejects.toThrow("failed after safe repair");
  });
});

describe("EvidenceSummarizerStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls model with appropriate prompts and returns output", async () => {
    const mockOutput = {
      summary: "This is a summary",
      sourceWarnings: ["Alert"],
      citations: ["item-1"],
    };

    mockModelAdapter.generateStructured.mockResolvedValueOnce({
      output: mockOutput,
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, model: "gpt-4", provider: "openai", durationMs: 100 },
    });

    const step = new EvidenceSummarizerStep();
    const executor = new AgentWorkflowExecutor(mockContext);
    const res = await executor.runStep(step, [
      { id: "item-1", sourceId: "sec", sourceName: "SEC", observedAt: "2023-11-03T00:00:00Z", title: "Filing", summary: "Summary text", warnings: ["Alert"] },
    ]);

    expect(res).toEqual(mockOutput);
  });
});

describe("OrderGenerationStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls model with proposed orders and returns output", async () => {
    const mockOutput = {
      rationale: "Rationale",
      uncertaintyNote: "None",
      proposedOrders: [
        {
          symbol: "AAPL",
          side: "BUY" as const,
          quantity: 10,
          orderType: "MARKET" as const,
          rationale: "Reason",
          evidenceItemIds: ["item-1"],
        },
      ],
    };

    mockModelAdapter.generateStructured.mockResolvedValueOnce({
      output: mockOutput,
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, model: "gpt-4", provider: "openai", durationMs: 100 },
    });

    const step = new OrderGenerationStep();
    const executor = new AgentWorkflowExecutor(mockContext);
    const res = await executor.runStep(step, {
      summaryText: "Summary text",
      symbols: ["AAPL"],
      outputMode: "PROPOSED_ORDERS",
    });

    expect(res).toEqual(mockOutput);
  });
});
