import { describe, expect, it } from "vitest";
import {
  agentTeamConfigSchema,
  agentDefinitionSchema,
  parseAgentTeamConfig,
  getTeamExecution,
} from "./schemas.js";

const validAgent = {
  id: "evidence-summarizer",
  name: "Evidence Summarizer",
  role: "ANALYST",
  systemPrompt: "Summarize evidence.",
  userPromptTemplate: "Evidence: {{evidenceItems}}",
  outputType: "EVIDENCE_ANALYSIS",
  handoffFrom: [],
  order: 1,
  enabled: true,
};

describe("agentDefinitionSchema", () => {
  it("parses a valid agent definition", () => {
    expect(agentDefinitionSchema.parse(validAgent)).toMatchObject(validAgent);
  });

  it("defaults handoffFrom and enabled", () => {
    const parsed = agentDefinitionSchema.parse({
      ...validAgent,
      handoffFrom: undefined,
      enabled: undefined,
    });

    expect(parsed.handoffFrom).toEqual([]);
    expect(parsed.enabled).toBe(true);
  });

  it("rejects invalid IDs and roles", () => {
    expect(() => agentDefinitionSchema.parse({ ...validAgent, id: "Bad ID" })).toThrow();
    expect(() => agentDefinitionSchema.parse({ ...validAgent, role: "BROWSER" })).toThrow();
  });
});

describe("agentTeamConfigSchema", () => {
  it("parses a valid v1 team config", () => {
    const parsed = agentTeamConfigSchema.parse({
      version: 1,
      agents: [validAgent],
    });

    expect(parsed.agents).toHaveLength(1);
    expect(parsed.version).toBe(1);
  });

  it("parses a valid v2 team config with execution metadata", () => {
    const parsed = agentTeamConfigSchema.parse({
      version: 2,
      agents: [validAgent],
      execution: {
        mode: "DAG",
        maxDebateRounds: 2,
        maxRiskDebateRounds: 3,
      },
    });

    expect(parsed.version).toBe(2);
    if (parsed.version === 2) {
      expect(parsed.execution.mode).toBe("DAG");
      expect(parsed.execution.maxDebateRounds).toBe(2);
    }
  });

  it("rejects empty teams", () => {
    expect(() => agentTeamConfigSchema.parse({ version: 1, agents: [] })).toThrow();
    expect(() => agentTeamConfigSchema.parse({ version: 2, agents: [], execution: { mode: "LINEAR" } })).toThrow();
  });

  it("parseAgentTeamConfig returns null for empty object", () => {
    expect(parseAgentTeamConfig({})).toBeNull();
  });

  it("getTeamExecution defaults v1 to LINEAR", () => {
    const config = agentTeamConfigSchema.parse({ version: 1, agents: [validAgent] });
    expect(getTeamExecution(config).mode).toBe("LINEAR");
  });
});
