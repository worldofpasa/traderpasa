import type {
  AgentCategory,
  AgentDebateSide,
  AgentRoleType,
  AgentSpecialization,
  AgentOutputType,
  AgentToolRef,
  AgentVariable,
} from "@pasa-trader/schemas";
import * as P from "./prompts.js";

export interface AgentTemplateSeed {
  slug: string;
  name: string;
  category: AgentCategory;
  role: AgentRoleType;
  specialization: AgentSpecialization;
  description: string;
  systemPrompt: string;
  userPromptTemplate: string;
  outputType: AgentOutputType;
  variables: AgentVariable[];
  toolRefs: AgentToolRef[];
  defaultDebateSide?: AgentDebateSide;
}

const RUNTIME_VARS = (keys: Array<{ key: string; label: string; description: string; example?: string }>): AgentVariable[] =>
  keys.map((k) => ({
    ...k,
    source: "RUNTIME" as const,
    required: true,
  }));

export const BUILTIN_AGENT_TEMPLATE_SEEDS: AgentTemplateSeed[] = [
  {
    slug: "market-analyst",
    name: "Market Analyst",
    category: "ANALYST",
    role: "ANALYST",
    specialization: "MARKET",
    description: "Technical market analyst selecting relevant indicators and producing trend reports grounded in verified price data.",
    systemPrompt: P.MARKET_ANALYST_SYSTEM,
    userPromptTemplate: `Analyze market conditions for {{symbols}} as of {{trade_date}}.

{{instrument_context}}

Verified market snapshot:
{{market_snapshot}}

Price and indicator evidence:
{{evidenceItems}}

Produce structured evidence analysis with claims tied to evidence refs.`,
    outputType: "EVIDENCE_ANALYSIS",
    variables: [
      ...RUNTIME_VARS([
        { key: "trade_date", label: "Trade Date", description: "Analysis date (YYYY-MM-DD)", example: "2026-01-15" },
        { key: "instrument_context", label: "Instrument Context", description: "Resolved ticker identity block" },
        { key: "symbols", label: "Symbols", description: "Comma-separated watchlist" },
        { key: "market_snapshot", label: "Market Snapshot", description: "Verified OHLCV and indicator snapshot" },
      ]),
      { key: "evidenceItems", label: "Evidence Items", source: "EVIDENCE", required: true, description: "Collected evidence bundle JSON" },
    ],
    toolRefs: [
      { id: "get_stock_data", label: "Stock OHLCV", evidenceConnectorId: "alpaca-market", reliability: "official_api" },
      { id: "get_indicators", label: "Technical Indicators", evidenceConnectorId: "alpaca-market", reliability: "official_api" },
      { id: "get_verified_market_snapshot", label: "Verified Snapshot", evidenceConnectorId: "alpaca-market", reliability: "official_api" },
    ],
  },
  {
    slug: "sentiment-analyst",
    name: "Sentiment Analyst",
    category: "ANALYST",
    role: "ANALYST",
    specialization: "SENTIMENT",
    description: "Multi-source sentiment analyst aggregating news, StockTwits, and Reddit into a structured sentiment report.",
    systemPrompt: P.SENTIMENT_ANALYST_SYSTEM,
    userPromptTemplate: `Produce a sentiment report for {{symbols}} covering {{start_date}} to {{trade_date}}.

{{instrument_context}}

### News headlines
<start_of_news>
{{news_block}}
<end_of_news>

### StockTwits
<start_of_stocktwits>
{{stocktwits_block}}
<end_of_stocktwits>

### Reddit
<start_of_reddit>
{{reddit_block}}
<end_of_reddit>`,
    outputType: "SENTIMENT_REPORT",
    variables: [
      ...RUNTIME_VARS([
        { key: "trade_date", label: "End Date", description: "Analysis end date" },
        { key: "start_date", label: "Start Date", description: "Seven-day lookback start" },
        { key: "instrument_context", label: "Instrument Context", description: "Resolved ticker identity" },
        { key: "symbols", label: "Symbols", description: "Watchlist symbols" },
        { key: "news_block", label: "News Block", description: "Pre-fetched news headlines" },
        { key: "stocktwits_block", label: "StockTwits Block", description: "Pre-fetched StockTwits messages" },
        { key: "reddit_block", label: "Reddit Block", description: "Pre-fetched Reddit posts" },
      ]),
    ],
    toolRefs: [
      { id: "get_news", label: "Ticker News", reliability: "best_effort_scrape" },
      { id: "fetch_stocktwits", label: "StockTwits", reliability: "third_party_api" },
      { id: "fetch_reddit", label: "Reddit", reliability: "best_effort_scrape" },
    ],
  },
  {
    slug: "news-analyst",
    name: "News Analyst",
    category: "ANALYST",
    role: "ANALYST",
    specialization: "NEWS",
    description: "Macro and company news researcher analyzing recent headlines and global affairs for trading relevance.",
    systemPrompt: P.NEWS_ANALYST_SYSTEM,
    userPromptTemplate: `Analyze news and macro trends for {{symbols}} as of {{trade_date}} (asset type: {{asset_type}}).

{{instrument_context}}

News evidence:
{{news_block}}

Global news evidence:
{{global_news_block}}

Additional evidence:
{{evidenceItems}}`,
    outputType: "EVIDENCE_ANALYSIS",
    variables: [
      ...RUNTIME_VARS([
        { key: "trade_date", label: "Trade Date", description: "Analysis date" },
        { key: "asset_type", label: "Asset Type", description: "stock or crypto", example: "stock" },
        { key: "instrument_context", label: "Instrument Context", description: "Resolved ticker identity" },
        { key: "symbols", label: "Symbols", description: "Watchlist" },
        { key: "news_block", label: "Ticker News", description: "Pre-fetched company/asset news" },
        { key: "global_news_block", label: "Global News", description: "Pre-fetched macro news" },
      ]),
      { key: "evidenceItems", label: "Evidence Items", source: "EVIDENCE", required: false, description: "Supplemental evidence bundle" },
    ],
    toolRefs: [
      { id: "get_news", label: "Ticker News", reliability: "best_effort_scrape" },
      { id: "get_global_news", label: "Global News", reliability: "best_effort_scrape" },
    ],
  },
  {
    slug: "fundamentals-analyst",
    name: "Fundamentals Analyst",
    category: "ANALYST",
    role: "ANALYST",
    specialization: "FUNDAMENTALS",
    description: "Fundamental analyst reviewing financial statements, company profile, and intrinsic value indicators.",
    systemPrompt: P.FUNDAMENTALS_ANALYST_SYSTEM,
    userPromptTemplate: `Analyze fundamentals for {{symbols}} as of {{trade_date}}.

{{instrument_context}}

Fundamentals evidence:
{{fundamentals_block}}

Financial statements:
{{financials_block}}

Additional evidence:
{{evidenceItems}}`,
    outputType: "EVIDENCE_ANALYSIS",
    variables: [
      ...RUNTIME_VARS([
        { key: "trade_date", label: "Trade Date", description: "Analysis date" },
        { key: "instrument_context", label: "Instrument Context", description: "Resolved ticker identity" },
        { key: "symbols", label: "Symbols", description: "Watchlist" },
        { key: "fundamentals_block", label: "Fundamentals", description: "Pre-fetched fundamentals summary" },
        { key: "financials_block", label: "Financial Statements", description: "Balance sheet, income, cashflow" },
      ]),
      { key: "evidenceItems", label: "Evidence Items", source: "EVIDENCE", required: false, description: "Supplemental evidence" },
    ],
    toolRefs: [
      { id: "get_fundamentals", label: "Fundamentals", reliability: "third_party_api" },
      { id: "get_balance_sheet", label: "Balance Sheet", reliability: "third_party_api" },
      { id: "get_cashflow", label: "Cash Flow", reliability: "third_party_api" },
      { id: "get_income_statement", label: "Income Statement", reliability: "third_party_api" },
    ],
  },
  {
    slug: "bull-researcher",
    name: "Bull Researcher",
    category: "RESEARCHER",
    role: "RESEARCHER",
    specialization: "BULL",
    description: "Bullish researcher building the growth case from analyst reports in structured debate.",
    systemPrompt: `You are a Bull Analyst. Build the strongest bull case from provided research. Acknowledge counter-arguments honestly. Side must be BULL.`,
    userPromptTemplate: P.BULL_RESEARCHER_USER,
    outputType: "DEBATE_THESIS",
    defaultDebateSide: "BULL",
    variables: [
      { key: "instrument_context", label: "Instrument Context", source: "RUNTIME", required: true, description: "Ticker identity" },
      { key: "debate.history", label: "Debate History", source: "DEBATE_STATE", required: false, description: "Full debate transcript" },
      { key: "debate.current_response", label: "Last Opposing Argument", source: "DEBATE_STATE", required: false, description: "Most recent bear argument" },
    ],
    toolRefs: [],
  },
  {
    slug: "bear-researcher",
    name: "Bear Researcher",
    category: "RESEARCHER",
    role: "RESEARCHER",
    specialization: "BEAR",
    description: "Bearish researcher emphasizing risks and countering the bull thesis in structured debate.",
    systemPrompt: `You are a Bear Analyst. Build the strongest bear case from provided research. Acknowledge counter-arguments honestly. Side must be BEAR.`,
    userPromptTemplate: P.BEAR_RESEARCHER_USER,
    outputType: "DEBATE_THESIS",
    defaultDebateSide: "BEAR",
    variables: [
      { key: "instrument_context", label: "Instrument Context", source: "RUNTIME", required: true, description: "Ticker identity" },
      { key: "debate.history", label: "Debate History", source: "DEBATE_STATE", required: false, description: "Full debate transcript" },
      { key: "debate.current_response", label: "Last Opposing Argument", source: "DEBATE_STATE", required: false, description: "Most recent bull argument" },
    ],
    toolRefs: [],
  },
  {
    slug: "research-manager",
    name: "Research Manager",
    category: "MANAGER",
    role: "SYNTHESIZER",
    specialization: "RESEARCH_MANAGER",
    description: "Facilitator judging the bull/bear debate and producing a rated investment plan.",
    systemPrompt: `You are the Research Manager. Synthesize debate into a clear investment plan with a 5-tier rating (Buy/Overweight/Hold/Underweight/Sell).`,
    userPromptTemplate: P.RESEARCH_MANAGER_USER,
    outputType: "SYNTHESIS",
    variables: [
      { key: "instrument_context", label: "Instrument Context", source: "RUNTIME", required: true, description: "Ticker identity" },
      { key: "debate.history", label: "Debate History", source: "DEBATE_STATE", required: true, description: "Complete bull/bear debate" },
    ],
    toolRefs: [],
  },
  {
    slug: "trader",
    name: "Trader",
    category: "TRADER",
    role: "TRADER",
    specialization: "TRADER",
    description: "Translates the research manager's plan into a concrete transaction proposal.",
    systemPrompt: P.TRADER_SYSTEM,
    userPromptTemplate: P.TRADER_USER,
    outputType: "PROPOSED_ORDERS",
    variables: [
      { key: "symbols", label: "Symbols", source: "RUNTIME", required: true, description: "Watchlist" },
      { key: "instrument_context", label: "Instrument Context", source: "RUNTIME", required: true, description: "Ticker identity" },
      { key: "outputMode", label: "Output Mode", source: "RUNTIME", required: true, description: "PROPOSED_ORDERS or RANKED_IDEAS" },
    ],
    toolRefs: [],
  },
  {
    slug: "aggressive-debator",
    name: "Aggressive Risk Analyst",
    category: "RISK_DEBATOR",
    role: "RISK_REVIEWER",
    specialization: "AGGRESSIVE",
    description: "Risk debator championing high-reward strategies and challenging conservative caution.",
    systemPrompt: `You are the Aggressive Risk Analyst. Champion upside and challenge overly cautious views in conversational debate.`,
    userPromptTemplate: P.AGGRESSIVE_DEBATOR_USER,
    outputType: "RISK_REVIEW",
    defaultDebateSide: "AGGRESSIVE",
    variables: [
      { key: "instrument_context", label: "Instrument Context", source: "RUNTIME", required: true, description: "Ticker identity" },
      { key: "risk_debate.history", label: "Risk Debate History", source: "DEBATE_STATE", required: false, description: "Risk debate transcript" },
      { key: "risk_debate.conservative_response", label: "Conservative Last", source: "DEBATE_STATE", required: false, description: "Last conservative argument" },
      { key: "risk_debate.neutral_response", label: "Neutral Last", source: "DEBATE_STATE", required: false, description: "Last neutral argument" },
    ],
    toolRefs: [],
  },
  {
    slug: "conservative-debator",
    name: "Conservative Risk Analyst",
    category: "RISK_DEBATOR",
    role: "RISK_REVIEWER",
    specialization: "CONSERVATIVE",
    description: "Risk debator prioritizing capital preservation and challenging aggressive risk-taking.",
    systemPrompt: `You are the Conservative Risk Analyst. Emphasize stability and challenge excessive risk appetite.`,
    userPromptTemplate: P.CONSERVATIVE_DEBATOR_USER,
    outputType: "RISK_REVIEW",
    defaultDebateSide: "CONSERVATIVE",
    variables: [
      { key: "instrument_context", label: "Instrument Context", source: "RUNTIME", required: true, description: "Ticker identity" },
      { key: "risk_debate.history", label: "Risk Debate History", source: "DEBATE_STATE", required: false, description: "Risk debate transcript" },
      { key: "risk_debate.aggressive_response", label: "Aggressive Last", source: "DEBATE_STATE", required: false, description: "Last aggressive argument" },
      { key: "risk_debate.neutral_response", label: "Neutral Last", source: "DEBATE_STATE", required: false, description: "Last neutral argument" },
    ],
    toolRefs: [],
  },
  {
    slug: "neutral-debator",
    name: "Neutral Risk Analyst",
    category: "RISK_DEBATOR",
    role: "RISK_REVIEWER",
    specialization: "NEUTRAL",
    description: "Risk debator balancing aggressive and conservative views for a moderate risk posture.",
    systemPrompt: `You are the Neutral Risk Analyst. Balance upside and downside, challenging both extreme views.`,
    userPromptTemplate: P.NEUTRAL_DEBATOR_USER,
    outputType: "RISK_REVIEW",
    defaultDebateSide: "NEUTRAL",
    variables: [
      { key: "instrument_context", label: "Instrument Context", source: "RUNTIME", required: true, description: "Ticker identity" },
      { key: "risk_debate.history", label: "Risk Debate History", source: "DEBATE_STATE", required: false, description: "Risk debate transcript" },
      { key: "risk_debate.aggressive_response", label: "Aggressive Last", source: "DEBATE_STATE", required: false, description: "Last aggressive argument" },
      { key: "risk_debate.conservative_response", label: "Conservative Last", source: "DEBATE_STATE", required: false, description: "Last conservative argument" },
    ],
    toolRefs: [],
  },
  {
    slug: "portfolio-manager",
    name: "Portfolio Manager",
    category: "MANAGER",
    role: "SYNTHESIZER",
    specialization: "PORTFOLIO_MANAGER",
    description: "Final synthesizer weighing risk debate and producing proposed orders for deterministic risk review (not execution).",
    systemPrompt: `You are the Portfolio Manager. Synthesize risk debate into final proposed orders. You do not execute trades — output draft orders only.`,
    userPromptTemplate: P.PORTFOLIO_MANAGER_USER,
    outputType: "PROPOSED_ORDERS",
    variables: [
      { key: "instrument_context", label: "Instrument Context", source: "RUNTIME", required: true, description: "Ticker identity" },
      { key: "past_context", label: "Past Context", source: "RUNTIME", required: false, description: "Prior decision lessons" },
      { key: "risk_debate.history", label: "Risk Debate", source: "DEBATE_STATE", required: true, description: "Complete risk debate" },
      { key: "outputMode", label: "Output Mode", source: "RUNTIME", required: true, description: "Strategy output mode" },
    ],
    toolRefs: [],
  },
];
