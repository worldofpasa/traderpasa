import { getPrismaClient, type PrismaClient, type StrategyInstance } from "@pasa-trader/db";
import { ROLE_DEFAULTS } from "@pasa-trader/agents";
import type { AgentTeamConfig } from "@pasa-trader/schemas";

export const DEFAULT_TWO_STEP_AGENT_TEAM: AgentTeamConfig = {
  version: 1,
  agents: [
    {
      id: "evidence-summarizer",
      name: "Evidence Summarizer",
      role: "ANALYST",
      systemPrompt: ROLE_DEFAULTS.ANALYST.systemPrompt,
      userPromptTemplate: ROLE_DEFAULTS.ANALYST.userPromptTemplate,
      outputType: "EVIDENCE_ANALYSIS",
      handoffFrom: [],
      order: 1,
      enabled: true,
    },
    {
      id: "order-generation",
      name: "Order Generation",
      role: "TRADER",
      systemPrompt: ROLE_DEFAULTS.TRADER.systemPrompt,
      userPromptTemplate: `Generate proposed orders based on the following evidence analysis.

Research claims:
{{evidence-summarizer.claims}}

Evidence refs:
{{evidence-summarizer.evidenceRefs}}

Freshness warnings:
{{evidence-summarizer.freshnessWarnings}}

Watchlist symbols: {{symbols}}
Output mode: {{outputMode}}`,
      outputType: "PROPOSED_ORDERS",
      handoffFrom: ["evidence-summarizer"],
      order: 2,
      enabled: true,
    },
  ],
};

function isEmptyAgentTeamConfig(raw: unknown): boolean {
  return !raw || (typeof raw === "object" && Object.keys(raw).length === 0);
}

export async function migrateStrategyToTeamConfig(
  strategyInstanceId: string,
  db: PrismaClient = getPrismaClient(),
): Promise<StrategyInstance> {
  const existing = await db.strategyInstance.findUnique({
    where: { id: strategyInstanceId },
  });

  if (!existing) {
    throw new Error(`Strategy instance not found: ${strategyInstanceId}`);
  }

  if (!isEmptyAgentTeamConfig(existing.agentTeamConfig)) {
    return existing;
  }

  return db.strategyInstance.update({
    where: { id: strategyInstanceId },
    data: {
      agentTeamConfig: DEFAULT_TWO_STEP_AGENT_TEAM,
    },
  });
}

export async function migrateEmptyStrategyTeamConfigs(
  db: PrismaClient = getPrismaClient(),
): Promise<{ inspected: number; migrated: number }> {
  const strategies = await db.strategyInstance.findMany({
    where: { status: { not: "DELETED" } },
  });

  let migrated = 0;
  for (const strategy of strategies) {
    if (!isEmptyAgentTeamConfig(strategy.agentTeamConfig)) continue;
    await migrateStrategyToTeamConfig(strategy.id, db);
    migrated += 1;
  }

  return { inspected: strategies.length, migrated };
}
