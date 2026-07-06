import type { AgentDefinition, AgentTeamConfigV2 } from "@pasa-trader/schemas";
import { BUILTIN_AGENT_TEMPLATE_SEEDS } from "./seeds.js";

function seedToAgent(seedSlug: string, overrides: Partial<AgentDefinition> & { id: string; order: number; handoffFrom: string[] }): AgentDefinition {
  const seed = BUILTIN_AGENT_TEMPLATE_SEEDS.find((s) => s.slug === seedSlug);
  if (!seed) throw new Error(`Missing seed: ${seedSlug}`);
  return {
    id: overrides.id,
    name: seed.name,
    role: seed.role,
    systemPrompt: seed.systemPrompt,
    userPromptTemplate: seed.userPromptTemplate,
    outputType: seed.outputType,
    specialization: seed.specialization,
    handoffFrom: overrides.handoffFrom,
    order: overrides.order,
    enabled: overrides.enabled ?? true,
    credentialId: overrides.credentialId,
    templateId: overrides.templateId,
  };
}

/** Full TradingAgents-style 12-agent desk (portfolio manager is terminal). */
export function buildTradingDeskTeamConfig(templateIds?: Record<string, string>): AgentTeamConfigV2 {
  const tid = (slug: string) => templateIds?.[slug];

  const agents: AgentDefinition[] = [
    seedToAgent("market-analyst", { id: "market-analyst", order: 1, handoffFrom: [], templateId: tid("market-analyst") }),
    seedToAgent("sentiment-analyst", { id: "sentiment-analyst", order: 1, handoffFrom: [], templateId: tid("sentiment-analyst") }),
    seedToAgent("news-analyst", { id: "news-analyst", order: 1, handoffFrom: [], templateId: tid("news-analyst") }),
    seedToAgent("fundamentals-analyst", { id: "fundamentals-analyst", order: 1, handoffFrom: [], templateId: tid("fundamentals-analyst") }),
    seedToAgent("bull-researcher", {
      id: "bull-researcher",
      order: 2,
      handoffFrom: ["market-analyst", "sentiment-analyst", "news-analyst", "fundamentals-analyst"],
      templateId: tid("bull-researcher"),
    }),
    seedToAgent("bear-researcher", {
      id: "bear-researcher",
      order: 2,
      handoffFrom: ["market-analyst", "sentiment-analyst", "news-analyst", "fundamentals-analyst"],
      templateId: tid("bear-researcher"),
    }),
    seedToAgent("research-manager", {
      id: "research-manager",
      order: 3,
      handoffFrom: ["bull-researcher", "bear-researcher"],
      templateId: tid("research-manager"),
    }),
    seedToAgent("trader", {
      id: "trader",
      order: 4,
      handoffFrom: ["research-manager"],
      templateId: tid("trader"),
    }),
    seedToAgent("aggressive-debator", {
      id: "aggressive-debator",
      order: 5,
      handoffFrom: ["trader"],
      templateId: tid("aggressive-debator"),
    }),
    seedToAgent("conservative-debator", {
      id: "conservative-debator",
      order: 5,
      handoffFrom: ["trader"],
      templateId: tid("conservative-debator"),
    }),
    seedToAgent("neutral-debator", {
      id: "neutral-debator",
      order: 5,
      handoffFrom: ["trader"],
      templateId: tid("neutral-debator"),
    }),
    seedToAgent("portfolio-manager", {
      id: "portfolio-manager",
      order: 6,
      handoffFrom: ["aggressive-debator", "conservative-debator", "neutral-debator", "research-manager", "trader"],
      templateId: tid("portfolio-manager"),
    }),
  ];

  return {
    version: 2,
    agents,
    execution: {
      mode: "TRADING_DESK",
      maxDebateRounds: 1,
      maxRiskDebateRounds: 1,
      parallelGroups: [
        {
          id: "analysts",
          agentIds: ["market-analyst", "sentiment-analyst", "news-analyst", "fundamentals-analyst"],
        },
      ],
    },
  };
}
