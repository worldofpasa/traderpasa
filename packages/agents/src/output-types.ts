import { z } from "zod";
import type { AgentOutputType } from "@pasa-trader/schemas";

// ─── Per-outputType Zod Schemas ───────────────────────────────────────────────

export const evidenceAnalysisSchema = z.object({
  claims: z.array(z.string().min(1)),
  evidenceRefs: z.array(z.string().min(1)),
  freshnessWarnings: z.array(z.string()),
  uncertaintyNote: z.string().optional(),
  confidence: z.number().min(0).max(1),
});
export type EvidenceAnalysis = z.infer<typeof evidenceAnalysisSchema>;

export const debateThesisSchema = z.object({
  side: z.enum(["BULL", "BEAR"]),
  thesis: z.string().min(1),
  conviction: z.number().min(0).max(1),
  supportingRefs: z.array(z.string()),
  counterArguments: z.array(z.string()),
});
export type DebateThesis = z.infer<typeof debateThesisSchema>;

export const rankedOpportunitySchema = z.object({
  symbol: z.string().min(1),
  conviction: z.number().min(0).max(1),
  bullCase: z.string().min(1),
  bearCase: z.string().min(1),
  suggestedSide: z.enum(["BUY", "SELL", "SELL_SHORT", "BUY_TO_COVER"]),
});

export const portfolioRatingSchema = z.enum([
  "Buy",
  "Overweight",
  "Hold",
  "Underweight",
  "Sell",
]);

export const synthesisSchema = z.object({
  rankedOpportunities: z.array(rankedOpportunitySchema),
  rejectedSymbols: z.array(z.string()),
  overallUncertainty: z.string().min(1),
  summaryRationale: z.string().min(1),
  recommendation: portfolioRatingSchema.optional(),
  rationale: z.string().optional(),
  strategicActions: z.string().optional(),
});
export type Synthesis = z.infer<typeof synthesisSchema>;

export const sentimentBandSchema = z.enum([
  "Bullish",
  "Mildly Bullish",
  "Neutral",
  "Mixed",
  "Mildly Bearish",
  "Bearish",
]);

export const sentimentReportSchema = z.object({
  overall_band: sentimentBandSchema,
  overall_score: z.number().min(0).max(10),
  confidence: z.enum(["low", "medium", "high"]),
  narrative: z.string().min(1),
});
export type SentimentReport = z.infer<typeof sentimentReportSchema>;

// Reuse existing order schemas from synthesis.ts for PROPOSED_ORDERS.
export { orderGenerationSchema as proposedOrdersSchema } from "./synthesis.js";

export const riskReviewSchema = z.object({
  concerns: z.array(z.string()),
  mitigations: z.array(z.string()),
  qualitativeRiskScore: z.enum(["LOW", "MEDIUM", "HIGH"]),
  note: z.string().min(1),
});
export type RiskReview = z.infer<typeof riskReviewSchema>;

// ─── Unified schema map ───────────────────────────────────────────────────────

import { agentRankedIdeaSchema, orderGenerationSchema } from "./synthesis.js";

export const rankedIdeasSchema = z.object({
  rationale: z.string().min(1),
  uncertaintyNote: z.string().optional(),
  rankedIdeas: z.array(agentRankedIdeaSchema),
});
export type RankedIdeas = z.infer<typeof rankedIdeasSchema>;

export const OUTPUT_TYPE_SCHEMAS: Record<AgentOutputType, z.ZodType> = {
  EVIDENCE_ANALYSIS: evidenceAnalysisSchema,
  DEBATE_THESIS: debateThesisSchema,
  SYNTHESIS: synthesisSchema,
  PROPOSED_ORDERS: orderGenerationSchema,
  RANKED_IDEAS: rankedIdeasSchema,
  RISK_REVIEW: riskReviewSchema,
  SENTIMENT_REPORT: sentimentReportSchema,
};
export const outputTypeSchemas = OUTPUT_TYPE_SCHEMAS;

// ─── Schema hints ─────────────────────────────────────────────────────────────
// Static JSON templates injected into system prompts so models know the exact
// field names and types required. Must stay in sync with the schemas above.

export const OUTPUT_TYPE_SCHEMA_HINTS: Record<AgentOutputType, string> = {
  EVIDENCE_ANALYSIS: `{
  "claims": ["string — factual claim extracted from evidence"],
  "evidenceRefs": ["string — source/item ID for each claim"],
  "freshnessWarnings": ["string — any staleness concerns"],
  "uncertaintyNote": "string (optional) — what information is missing",
  "confidence": 0.0
}`,
  DEBATE_THESIS: `{
  "side": "BULL",
  "thesis": "string — your coherent argument for this side",
  "conviction": 0.0,
  "supportingRefs": ["string — evidence item IDs that support the thesis"],
  "counterArguments": ["string — strongest opposing arguments"]
}`,
  SYNTHESIS: `{
  "rankedOpportunities": [
    {
      "symbol": "TICKER",
      "conviction": 0.0,
      "bullCase": "string",
      "bearCase": "string",
      "suggestedSide": "BUY"
    }
  ],
  "rejectedSymbols": ["TICKER"],
  "overallUncertainty": "string",
  "summaryRationale": "string"
}`,
  PROPOSED_ORDERS: `{
  "rationale": "string — overall reasoning",
  "uncertaintyNote": "string (optional)",
  "proposedOrders": [
    {
      "symbol": "TICKER",
      "side": "BUY",
      "quantity": 0,
      "orderType": "MARKET",
      "limitPrice": null,
      "rationale": "string",
      "evidenceItemIds": ["string"]
    }
  ]
}`,
  RANKED_IDEAS: `{
  "rationale": "string — overall reasoning",
  "uncertaintyNote": "string (optional)",
  "rankedIdeas": [
    {
      "symbol": "TICKER",
      "rank": 1,
      "conviction": 0.0,
      "rationale": "string",
      "evidenceItemIds": ["string"]
    }
  ]
}`,
  RISK_REVIEW: `{
  "concerns": ["string — qualitative risk concern"],
  "mitigations": ["string — suggested mitigation"],
  "qualitativeRiskScore": "LOW",
  "note": "string — overall qualitative risk assessment"
}`,
  SENTIMENT_REPORT: `{
  "overall_band": "Neutral",
  "overall_score": 5.0,
  "confidence": "medium",
  "narrative": "string — source-by-source sentiment breakdown with evidence"
}`,
};

export class AgentOutputValidationError extends Error {
  constructor(
    readonly outputType: AgentOutputType,
    readonly cause: z.ZodError,
  ) {
    super(`Model output failed ${outputType} schema validation.`);
    this.name = "AgentOutputValidationError";
  }
}

export function validateAgentOutput(outputType: AgentOutputType, raw: unknown): unknown {
  const schema = OUTPUT_TYPE_SCHEMAS[outputType];
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new AgentOutputValidationError(outputType, result.error);
  }
  return result.data;
}
