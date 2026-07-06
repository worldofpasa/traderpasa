import { describe, expect, it } from "vitest";
import { mergePrefetchIntoTopLevelVars, prefetchEvidenceForAgents } from "./agent-evidence-prefetch.js";

describe("prefetchEvidenceForAgents", () => {
  it("injects trade_date and instrument_context for market analyst", () => {
    const vars = prefetchEvidenceForAgents(
      [{
        id: "market-analyst",
        name: "Market Analyst",
        role: "ANALYST",
        specialization: "MARKET",
        systemPrompt: "x",
        userPromptTemplate: "y",
        outputType: "EVIDENCE_ANALYSIS",
        handoffFrom: [],
        order: 1,
        enabled: true,
      }],
      {
        symbols: ["AAPL"],
        tradeDate: "2026-06-06",
        evidenceItemsJson: "[]",
      },
    );

    expect(vars.trade_date).toBe("2026-06-06");
    expect(vars.instrument_context).toContain("AAPL");
    expect(vars.market_snapshot).toContain("AAPL");
  });

  it("mergePrefetchIntoTopLevelVars preserves existing keys", () => {
    const merged = mergePrefetchIntoTopLevelVars(
      { symbols: "AAPL", outputMode: "PROPOSED_ORDERS" },
      { trade_date: "2026-06-06", start_date: "2026-05-30", instrument_context: "ctx", market_snapshot: "m", news_block: "n", global_news_block: "g", stocktwits_block: "s", reddit_block: "r", fundamentals_block: "f", financials_block: "fs", asset_type: "stock", past_context: "" },
    );
    expect(merged.symbols).toBe("AAPL");
    expect(merged.trade_date).toBe("2026-06-06");
  });
});
