import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentTeamConfig } from "@pasa-trader/schemas";
import type { StructuredModelRequest } from "@pasa-trader/adapters";
import type { PrismaClient } from "@pasa-trader/db";

const mockGenerateStructured = vi.hoisted(() => vi.fn());

vi.mock("./credentials.js", () => ({
  decryptCredentialSecret: vi.fn().mockReturnValue('{"apiKey":"sk-test"}'),
  getCredentialEncryptionKeyFromEnv: vi.fn().mockReturnValue(Buffer.alloc(32)),
}));

vi.mock("@pasa-trader/adapters", () => {
  return {
    OpenAICompatibleModelAdapter: vi.fn().mockImplementation(function (this: Record<string, unknown>, provider: string) {
      this.provider = provider;
      this.testConnection = vi.fn();
      this.generateStructured = mockGenerateStructured;
    }),
  };
});

vi.mock("./agent-workflows.js", () => ({
  MissingModelCredentialError: class MissingModelCredentialError extends Error {
    constructor() {
      super("No model provider credential configured for user.");
      this.name = "MissingModelCredentialError";
    }
  },
}));

const mockCredential = { id: "cred-1", provider: "openai", iv: "iv", encryptedPayload: "enc", authTag: "tag" };

function makeDb(returnNull = false) {
  return {
    credential: {
      findFirst: vi.fn().mockResolvedValue(returnNull ? null : mockCredential),
    },
  } as unknown as PrismaClient;
}

const analystAgent: AgentTeamConfig["agents"][number] = {
  id: "analyst",
  name: "Analyst",
  role: "ANALYST",
  systemPrompt: "Analyze evidence.",
  userPromptTemplate: "Analyze: {{evidenceItems}} for {{symbols}}",
  outputType: "EVIDENCE_ANALYSIS",
  handoffFrom: [],
  order: 1,
  enabled: true,
};

const twoAgentTeam: AgentTeamConfig = {
  version: 1,
  agents: [
    analystAgent,
    {
      id: "synth",
      name: "Synthesizer",
      role: "SYNTHESIZER",
      systemPrompt: "Synthesize.",
      userPromptTemplate: "Use claims {{analyst.claims}} for {{symbols}}",
      outputType: "SYNTHESIS",
      handoffFrom: ["analyst"],
      order: 2,
      enabled: true,
    },
  ],
};

const fourAgentTeam: AgentTeamConfig = {
  version: 1,
  agents: [
    analystAgent,
    {
      id: "bull",
      name: "Bull Researcher",
      role: "RESEARCHER",
      systemPrompt: "Build bull case.",
      userPromptTemplate: "Bull: {{analyst.claims}}",
      outputType: "DEBATE_THESIS",
      handoffFrom: ["analyst"],
      order: 2,
      enabled: true,
    },
    {
      id: "bear",
      name: "Bear Researcher",
      role: "RESEARCHER",
      systemPrompt: "Build bear case.",
      userPromptTemplate: "Bear: {{analyst.claims}}",
      outputType: "DEBATE_THESIS",
      handoffFrom: ["analyst"],
      order: 3,
      enabled: true,
    },
    {
      id: "trader",
      name: "Trader",
      role: "TRADER",
      systemPrompt: "Trade.",
      userPromptTemplate: "Bull {{bull.thesis}} Bear {{bear.thesis}}",
      outputType: "PROPOSED_ORDERS",
      handoffFrom: ["bull", "bear"],
      order: 4,
      enabled: true,
    },
  ],
};

function outputForRequest(input: StructuredModelRequest<unknown>) {
  const prompt = `${input.systemPrompt}\n${input.userPrompt}`;
  if (prompt.includes("Trade.")) {
    return {
      rationale: "AAPL has the cleanest supported setup.",
      proposedOrders: [{
        symbol: "AAPL",
        side: "BUY",
        quantity: 1,
        orderType: "MARKET",
        rationale: "Supported by debate.",
        evidenceItemIds: ["evidence-1"],
      }],
    };
  }
  if (prompt.includes("bull case")) {
    return {
      side: "BULL",
      thesis: "Bull thesis",
      conviction: 0.7,
      supportingRefs: ["evidence-1"],
      counterArguments: ["Valuation risk"],
    };
  }
  if (prompt.includes("bear case")) {
    return {
      side: "BEAR",
      thesis: "Bear thesis",
      conviction: 0.4,
      supportingRefs: ["evidence-1"],
      counterArguments: ["Momentum remains strong"],
    };
  }
  if (prompt.includes("Synthesize")) {
    return {
      rankedOpportunities: [{
        symbol: "AAPL",
        conviction: 0.8,
        bullCase: "Strong demand",
        bearCase: "Valuation risk",
        suggestedSide: "BUY",
      }],
      rejectedSymbols: [],
      overallUncertainty: "Moderate",
      summaryRationale: "AAPL ranks highest.",
    };
  }
  return {
    claims: ["AAPL revenue accelerated"],
    evidenceRefs: ["evidence-1"],
    freshnessWarnings: [],
    confidence: 0.8,
  };
}

function userPromptForCall(index: number) {
  const call = mockGenerateStructured.mock.calls[index];
  if (!call) throw new Error(`Missing model call at index ${String(index)}.`);
  const input = call[0] as StructuredModelRequest<unknown>;
  return input.userPrompt;
}

describe("runDynamicAgentTeam", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateStructured.mockImplementation((input: StructuredModelRequest<unknown>) =>
      Promise.resolve({
        output: input.outputSchema.parse(outputForRequest(input)),
        usage: {
          promptTokens: 100,
          completionTokens: 25,
          totalTokens: 125,
          model: "test-model",
          provider: "openai",
          durationMs: 50,
        },
      }),
    );
  });

  it("runs a 2-agent chain with handoff substitution and usage metadata", async () => {
    const { runDynamicAgentTeam } = await import("./dynamic-agent-executor.js");
    const result = await runDynamicAgentTeam(
      twoAgentTeam,
      { evidenceItems: "[]", symbols: "AAPL", outputMode: "PROPOSED_ORDERS", side: "BULL" },
      "user-1",
      "METADATA",
      makeDb(),
    );

    expect(result.agentRuns).toHaveLength(2);
    expect(result.agentRuns[0]).toMatchObject({ agentId: "analyst", promptTokens: 100, completionTokens: 25, repaired: false });
    expect(result.terminalOutputType).toBe("SYNTHESIS");
    expect(userPromptForCall(1)).toContain("AAPL revenue accelerated");
  });

  it("runs a 4-agent chain with fan-in handoffs", async () => {
    const { runDynamicAgentTeam } = await import("./dynamic-agent-executor.js");
    const result = await runDynamicAgentTeam(fourAgentTeam, { symbols: "AAPL", evidenceItems: "[]" }, "user-1", "FULL", makeDb());

    expect(result.agentRuns.map((run) => run.agentId)).toEqual(["analyst", "bull", "bear", "trader"]);
    expect(userPromptForCall(3)).toContain("Bull thesis");
    expect(userPromptForCall(3)).toContain("Bear thesis");
  });

  it("throws when the last enabled agent has non-terminal outputType", async () => {
    const { runDynamicAgentTeam } = await import("./dynamic-agent-executor.js");
    const invalidTeam: AgentTeamConfig = {
      version: 1,
      agents: [{ ...analystAgent, outputType: "EVIDENCE_ANALYSIS" }],
    };

    await expect(runDynamicAgentTeam(invalidTeam, {}, "user-1", "METADATA", makeDb())).rejects.toThrow("terminal output type");
  });

  it("throws when no enabled agents", async () => {
    const { runDynamicAgentTeam } = await import("./dynamic-agent-executor.js");
    const disabledTeam: AgentTeamConfig = {
      version: 1,
      agents: [{ ...analystAgent, enabled: false }],
    };

    await expect(runDynamicAgentTeam(disabledTeam, {}, "user-1", "METADATA", makeDb())).rejects.toThrow("no enabled agents");
  });

  it("throws MissingModelCredentialError when credential fallback is missing", async () => {
    const { runDynamicAgentTeam } = await import("./dynamic-agent-executor.js");

    await expect(runDynamicAgentTeam(twoAgentTeam, {}, "user-1", "METADATA", makeDb(true))).rejects.toThrow("No model provider credential");
  });

  it("records failed agent output when model repair fails", async () => {
    const { runDynamicAgentTeam } = await import("./dynamic-agent-executor.js");
    mockGenerateStructured.mockRejectedValue(new Error("invalid model output"));

    await expect(runDynamicAgentTeam(twoAgentTeam, {}, "user-1", "METADATA", makeDb())).rejects.toThrow("Agent \"Analyst\" failed");
    expect(mockGenerateStructured).toHaveBeenCalledTimes(2);
  });
});

describe("parseAgentTeamConfig", () => {
  it("returns null for empty config", async () => {
    const { parseAgentTeamConfig } = await import("./dynamic-agent-executor.js");
    expect(parseAgentTeamConfig({})).toBeNull();
    expect(parseAgentTeamConfig(null)).toBeNull();
  });

  it("parses a valid team config", async () => {
    const { parseAgentTeamConfig } = await import("./dynamic-agent-executor.js");
    expect(parseAgentTeamConfig(twoAgentTeam)?.agents).toHaveLength(2);
  });

  it("throws on invalid config", async () => {
    const { parseAgentTeamConfig } = await import("./dynamic-agent-executor.js");
    expect(() => parseAgentTeamConfig({ version: 1, agents: [] })).toThrow();
  });
});
