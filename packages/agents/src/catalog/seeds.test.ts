import { describe, expect, it } from "vitest";
import { agentTeamConfigSchema } from "@pasa-trader/schemas";
import { BUILTIN_AGENT_TEMPLATE_SEEDS } from "./seeds.js";
import { buildTradingDeskTeamConfig } from "./trading-desk-preset.js";

describe("BUILTIN_AGENT_TEMPLATE_SEEDS", () => {
  it("contains 12 builtin agent templates", () => {
    expect(BUILTIN_AGENT_TEMPLATE_SEEDS).toHaveLength(12);
  });

  it("has unique slugs", () => {
    const slugs = BUILTIN_AGENT_TEMPLATE_SEEDS.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("each seed satisfies agent template create shape", () => {
    for (const seed of BUILTIN_AGENT_TEMPLATE_SEEDS) {
      expect(seed.systemPrompt.length).toBeGreaterThan(20);
      expect(seed.userPromptTemplate.length).toBeGreaterThan(5);
      expect(seed.variables.length).toBeGreaterThan(0);
    }
  });

  it("includes all TradingAgents categories", () => {
    const categories = new Set(BUILTIN_AGENT_TEMPLATE_SEEDS.map((s) => s.category));
    expect(categories.has("ANALYST")).toBe(true);
    expect(categories.has("RESEARCHER")).toBe(true);
    expect(categories.has("MANAGER")).toBe(true);
    expect(categories.has("TRADER")).toBe(true);
    expect(categories.has("RISK_DEBATOR")).toBe(true);
  });
});

describe("buildTradingDeskTeamConfig", () => {
  it("builds a valid v2 TRADING_DESK config with 12 agents", () => {
    const config = buildTradingDeskTeamConfig();
    expect(agentTeamConfigSchema.parse(config).version).toBe(2);
    expect(config.agents).toHaveLength(12);
    expect(config.execution.mode).toBe("TRADING_DESK");
    expect(config.execution.parallelGroups?.[0]?.agentIds).toHaveLength(4);
  });
});
