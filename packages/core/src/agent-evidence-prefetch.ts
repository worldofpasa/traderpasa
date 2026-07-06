import type { AgentDefinition } from "@pasa-trader/schemas";

const UNAVAILABLE = "<unavailable — connector not configured>";

export interface PrefetchInput {
  symbols: string[];
  tradeDate: string;
  evidenceItemsJson: string;
}

export interface PrefetchedVars {
  trade_date: string;
  start_date: string;
  instrument_context: string;
  market_snapshot: string;
  news_block: string;
  global_news_block: string;
  stocktwits_block: string;
  reddit_block: string;
  fundamentals_block: string;
  financials_block: string;
  asset_type: string;
  past_context: string;
}

function sevenDaysBack(tradeDate: string): string {
  const d = new Date(`${tradeDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
}

function buildInstrumentContext(symbols: string[]): string {
  const ticker = symbols[0] ?? "UNKNOWN";
  return (
    `The instrument to analyze is \`${ticker}\`. Use this exact ticker in every report and recommendation, ` +
    `preserving any exchange suffix. Watchlist: ${symbols.join(", ")}.`
  );
}

/** Deterministic evidence pre-fetch — maps TradingAgents tool refs to injectable prompt blocks. */
export function prefetchEvidenceForAgents(
  agents: AgentDefinition[],
  input: PrefetchInput,
): PrefetchedVars {
  const tradeDate = input.tradeDate;
  const startDate = sevenDaysBack(tradeDate);
  const instrumentContext = buildInstrumentContext(input.symbols);

  const hasMarket = agents.some((a) => a.specialization === "MARKET");
  const hasSentiment = agents.some((a) => a.specialization === "SENTIMENT");
  const hasNews = agents.some((a) => a.specialization === "NEWS");
  const hasFundamentals = agents.some((a) => a.specialization === "FUNDAMENTALS");

  return {
    trade_date: tradeDate,
    start_date: startDate,
    instrument_context: instrumentContext,
    asset_type: "stock",
    past_context: "",
    market_snapshot: hasMarket
      ? `Verified snapshot placeholder for ${input.symbols.join(", ")} on ${tradeDate}. See evidence bundle for OHLCV.`
      : UNAVAILABLE,
    news_block: hasSentiment || hasNews
      ? extractNewsFromEvidence(input.evidenceItemsJson) ?? `News placeholder for ${input.symbols.join(", ")} (${startDate} to ${tradeDate}).`
      : UNAVAILABLE,
    global_news_block: hasNews
      ? `Global macro news placeholder for ${tradeDate}.`
      : UNAVAILABLE,
    stocktwits_block: hasSentiment ? UNAVAILABLE : UNAVAILABLE,
    reddit_block: hasSentiment ? UNAVAILABLE : UNAVAILABLE,
    fundamentals_block: hasFundamentals
      ? `Fundamentals placeholder for ${input.symbols.join(", ")}.`
      : UNAVAILABLE,
    financials_block: hasFundamentals
      ? `Financial statements placeholder for ${input.symbols.join(", ")}.`
      : UNAVAILABLE,
  };
}

function extractNewsFromEvidence(evidenceJson: string): string | null {
  try {
    const items = JSON.parse(evidenceJson) as Array<{ title?: string; summary?: string; sourceName?: string }>;
    if (!Array.isArray(items) || items.length === 0) return null;
    return items
      .slice(0, 20)
      .map((item, i) => `${i + 1}. [${item.sourceName ?? "source"}] ${item.title ?? ""}: ${item.summary ?? ""}`)
      .join("\n");
  } catch {
    return null;
  }
}

export function mergePrefetchIntoTopLevelVars(
  topLevelVars: Record<string, string>,
  prefetch: PrefetchedVars,
): Record<string, string> {
  return { ...topLevelVars, ...prefetch };
}
