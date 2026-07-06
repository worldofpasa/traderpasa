import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { seedBuiltinAgentTemplates } from "../src/seed-builtin-agent-templates.js";

const db = new PrismaClient({
  adapter: new PrismaPg(process.env.DATABASE_URL ?? "postgres://pasatrader:pasatrader@localhost:55432/pasatrader"),
});

const templates = [
  {
    kind: "LONG_TERM_ALLOCATION" as const,
    name: "Long-Term Allocation",
    description:
      "Collects fundamental and institutional filing data to generate buy-and-hold equity allocation proposals. " +
      "Suited for low-frequency, multi-week holding periods. Not intended for intraday execution.",
    defaultConfig: {
      outputMode: "PROPOSED_ORDERS",
      executionMode: "PAPER",
      watchlistMode: "MANUAL",
      modelLoggingDepth: "METADATA",
      riskConfig: {
        maxPositionPct: 10,
        maxAccountExposurePct: 80,
        maxOrdersPerDay: 5,
      },
      sourceConfig: {
        secEdgar: { enabled: true, required: true },
        secForm4: { enabled: true, required: false },
        sec13f: { enabled: true, required: false },
        alpacaMarket: { enabled: true, required: false },
      },
      marketSessionRules: {
        allowPreMarket: false,
        allowAfterHours: false,
        sessionOnly: true,
      },
    },
  },
  {
    kind: "MOMENTUM" as const,
    name: "Momentum",
    description:
      "Analyzes price trend and news momentum to generate short-to-medium-term equity proposals. " +
      "Uses market data and news as primary evidence. Higher trading frequency than long-term allocation.",
    defaultConfig: {
      outputMode: "PROPOSED_ORDERS",
      executionMode: "PAPER",
      watchlistMode: "MANUAL",
      modelLoggingDepth: "METADATA",
      riskConfig: {
        maxPositionPct: 5,
        maxAccountExposurePct: 60,
        maxOrdersPerDay: 10,
      },
      sourceConfig: {
        alpacaMarket: { enabled: true, required: true },
        alpacaNews: { enabled: true, required: false },
        secForm4: { enabled: false, required: false },
      },
      marketSessionRules: {
        allowPreMarket: false,
        allowAfterHours: false,
        sessionOnly: true,
      },
    },
  },
  {
    kind: "SCALPING_DAY_TRADE_TEST" as const,
    name: "Scalping / Day Trade Test",
    description:
      "Generates intraday proposals based on short-term market data signals. " +
      "Intended for testing paper execution behavior, not as a production strategy. " +
      "Requires explicit paper-mode acknowledgment before enabling.",
    defaultConfig: {
      outputMode: "PROPOSED_ORDERS",
      executionMode: "PAPER",
      watchlistMode: "MANUAL",
      modelLoggingDepth: "FULL",
      riskConfig: {
        maxPositionPct: 2,
        maxAccountExposurePct: 20,
        maxOrdersPerDay: 20,
      },
      sourceConfig: {
        alpacaMarket: { enabled: true, required: true },
        alpacaNews: { enabled: false, required: false },
      },
      marketSessionRules: {
        allowPreMarket: false,
        allowAfterHours: false,
        sessionOnly: true,
      },
    },
  },
  {
    kind: "NEWS_DRIVEN" as const,
    name: "News-Driven",
    description:
      "Synthesizes news and public filing data to identify equity proposals tied to specific events. " +
      "Evidence bundle emphasizes recent news and SEC disclosures. " +
      "May generate ranked ideas or proposed orders depending on output mode.",
    defaultConfig: {
      outputMode: "RANKED_IDEAS",
      executionMode: "PAPER",
      watchlistMode: "MANUAL",
      modelLoggingDepth: "METADATA",
      riskConfig: {
        maxPositionPct: 5,
        maxAccountExposurePct: 50,
        maxOrdersPerDay: 8,
      },
      sourceConfig: {
        alpacaNews: { enabled: true, required: true },
        secEdgar: { enabled: true, required: false },
        secForm4: { enabled: true, required: false },
        alpacaMarket: { enabled: true, required: false },
      },
      marketSessionRules: {
        allowPreMarket: false,
        allowAfterHours: false,
        sessionOnly: true,
      },
    },
  },
  {
    kind: "INSIDER_POLITICAL_TRADE_FOLLOWING" as const,
    name: "Insider & Political Trade Following",
    description:
      "Follows SEC Form 4 insider disclosures and politician trade filings to generate equity proposals. " +
      "Evidence is best-effort for politician data due to reporting delays. " +
      "Proposals include source freshness warnings when data is stale.",
    defaultConfig: {
      outputMode: "PROPOSED_ORDERS",
      executionMode: "PAPER",
      watchlistMode: "DYNAMIC",
      modelLoggingDepth: "METADATA",
      riskConfig: {
        maxPositionPct: 5,
        maxAccountExposurePct: 40,
        maxOrdersPerDay: 5,
      },
      sourceConfig: {
        secForm4: { enabled: true, required: true },
        politicianTrades: { enabled: true, required: false },
        sec13f: { enabled: true, required: false },
        alpacaMarket: { enabled: false, required: false },
      },
      marketSessionRules: {
        allowPreMarket: false,
        allowAfterHours: false,
        sessionOnly: true,
      },
    },
  },
] as const;

async function main() {
  console.log("Seeding strategy templates...");

  for (const template of templates) {
    await db.strategyTemplate.upsert({
      where: { kind: template.kind },
      create: template,
      update: {
        name: template.name,
        description: template.description,
        defaultConfig: template.defaultConfig,
      },
    });
    console.log(`  ✓ ${template.name}`);
  }

  console.log("Seeding built-in agent templates...");
  const agentResult = await seedBuiltinAgentTemplates(db);
  console.log(`  ✓ agent templates (${agentResult.created} created, ${agentResult.skipped} already present)`);

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
