import { describe, expect, it, vi } from "vitest";
import { DEFAULT_TWO_STEP_AGENT_TEAM, migrateEmptyStrategyTeamConfigs, migrateStrategyToTeamConfig } from "./agent-team-migration.js";

const baseStrategy = {
  id: "strategy-1",
  userId: "user-1",
  templateId: "template-1",
  brokerAccountId: null,
  name: "Strategy",
  description: null,
  status: "DISABLED" as const,
  watchlistMode: "MANUAL" as const,
  symbols: ["AAPL"],
  sourceConfig: {},
  riskConfig: {},
  outputMode: "PROPOSED_ORDERS" as const,
  executionMode: "PAPER" as const,
  liveAcknowledgedAt: null,
  marketSessionRules: {},
  scheduleConfig: null,
  trailingStopConfig: null,
  modelLoggingDepth: "METADATA" as const,
  stepModelConfig: {},
  agentTeamConfig: {},
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("migrateStrategyToTeamConfig", () => {
  it("writes the default two-step team when agentTeamConfig is empty", async () => {
    const update = vi.fn().mockResolvedValue({ ...baseStrategy, agentTeamConfig: DEFAULT_TWO_STEP_AGENT_TEAM });
    const db = {
      strategyInstance: {
        findUnique: vi.fn().mockResolvedValue(baseStrategy),
        update,
      },
    } as never;

    const result = await migrateStrategyToTeamConfig("strategy-1", db);

    expect(update).toHaveBeenCalledWith({
      where: { id: "strategy-1" },
      data: { agentTeamConfig: DEFAULT_TWO_STEP_AGENT_TEAM },
    });
    expect(result.agentTeamConfig).toEqual(DEFAULT_TWO_STEP_AGENT_TEAM);
  });

  it("does not overwrite an existing team config", async () => {
    const existing = { ...baseStrategy, agentTeamConfig: { version: 1, agents: [{ id: "custom" }] } };
    const update = vi.fn();
    const db = {
      strategyInstance: {
        findUnique: vi.fn().mockResolvedValue(existing),
        update,
      },
    } as never;

    const result = await migrateStrategyToTeamConfig("strategy-1", db);

    expect(update).not.toHaveBeenCalled();
    expect(result).toBe(existing);
  });
});

describe("migrateEmptyStrategyTeamConfigs", () => {
  it("migrates only empty strategy configs", async () => {
    const update = vi.fn().mockResolvedValue(baseStrategy);
    const db = {
      strategyInstance: {
        findMany: vi.fn().mockResolvedValue([
          baseStrategy,
          { ...baseStrategy, id: "strategy-2", agentTeamConfig: { version: 1, agents: [{ id: "custom" }] } },
        ]),
        findUnique: vi.fn().mockResolvedValue(baseStrategy),
        update,
      },
    } as never;

    await expect(migrateEmptyStrategyTeamConfigs(db)).resolves.toEqual({ inspected: 2, migrated: 1 });
    expect(update).toHaveBeenCalledTimes(1);
  });
});
