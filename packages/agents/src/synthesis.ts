import { z } from "zod";
import type { AgentWorkflowStep } from "./runtime.js";
import { generateWithRepair } from "./runtime.js";

// ─── Input & Output Schemas ──────────────────────────────────────────────────

export const evidenceSummarySchema = z.object({
  summary: z.string().min(1),
  sourceWarnings: z.array(z.string()),
  citations: z.array(z.string()),
});

export type EvidenceSummary = z.infer<typeof evidenceSummarySchema>;

export const agentOrderSchema = z.object({
  symbol: z.string().min(1),
  side: z.enum(["BUY", "SELL", "SELL_SHORT", "BUY_TO_COVER"]),
  quantity: z.number().int().positive(),
  orderType: z.enum(["MARKET", "LIMIT"]),
  limitPrice: z.number().positive().optional(),
  rationale: z.string().min(1),
  evidenceItemIds: z.array(z.string().min(1)),
});

export type AgentOrder = z.infer<typeof agentOrderSchema>;

export const agentRankedIdeaSchema = z.object({
  symbol: z.string().min(1),
  rank: z.number().int().positive(),
  score: z.number().min(0).max(100),
  rationale: z.string().min(1),
  suggestedSide: z.enum(["BUY", "SELL", "SELL_SHORT", "BUY_TO_COVER"]),
});

export type AgentRankedIdea = z.infer<typeof agentRankedIdeaSchema>;

export const orderGenerationSchema = z.object({
  rationale: z.string().min(1),
  uncertaintyNote: z.string().optional(),
  proposedOrders: z.array(agentOrderSchema),
  rankedIdeas: z.array(agentRankedIdeaSchema).optional(),
});

export type OrderGenerationResult = z.infer<typeof orderGenerationSchema>;

// ─── Steps ───────────────────────────────────────────────────────────────────

export interface EvidenceItemInput {
  id: string;
  sourceId: string;
  sourceName: string;
  observedAt: string;
  title: string;
  summary: string;
  warnings: string[];
}

export class EvidenceSummarizerStep implements AgentWorkflowStep<EvidenceItemInput[], EvidenceSummary> {
  readonly name = "Evidence Summarizer";

  async run(input: EvidenceItemInput[], context: any): Promise<EvidenceSummary> {
    const systemPrompt = `You are a professional financial research assistant.
Summarize the provided evidence items for a strategy run.
Cite specific item IDs (e.g. "sec-edgar-...") in your summary.
Extract and highlight any source warnings or delay details explicitly in the "sourceWarnings" field.
Identify which sources were cited in the "citations" field.`;

    const userPrompt = `Here are the collected evidence items:\n\n${JSON.stringify(input, null, 2)}`;

    return generateWithRepair(context, systemPrompt, userPrompt, evidenceSummarySchema);
  }
}

export interface OrderGenerationInput {
  summaryText: string;
  symbols: string[];
  outputMode: "PROPOSED_ORDERS" | "RANKED_IDEAS";
}

export class OrderGenerationStep implements AgentWorkflowStep<OrderGenerationInput, OrderGenerationResult> {
  readonly name = "Order & Idea Generator";

  async run(input: OrderGenerationInput, context: any): Promise<OrderGenerationResult> {
    const systemPrompt = `You are an AI trading bot for Pasa Trader Platform.
Based on the research summary, generate a list of exact proposed orders or ranked trade ideas for the watchlist.
Output Mode is: ${input.outputMode}.
- If Output Mode is PROPOSED_ORDERS: populate the "proposedOrders" list. Only suggest trades supported by the evidence.
- If Output Mode is RANKED_IDEAS: populate the "rankedIdeas" list.
Specify which evidence item IDs support each trade in "evidenceItemIds".
Record an uncertainty note explaining what is missing or ambiguous.`;

    const userPrompt = `Research Summary:\n${input.summaryText}\n\nWatchlist Symbols: ${input.symbols.join(", ")}`;

    return generateWithRepair(context, systemPrompt, userPrompt, orderGenerationSchema);
  }
}
