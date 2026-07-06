import { describe, it, expect } from "vitest";
import { AgentOutputValidationError, validateAgentOutput, OUTPUT_TYPE_SCHEMAS } from "./output-types.js";
import type { AgentOutputType } from "@pasa-trader/schemas";

const validFixtures: Record<AgentOutputType, unknown> = {
  EVIDENCE_ANALYSIS: {
    claims: ["AAPL beat Q3 estimates by 8%"],
    evidenceRefs: ["sec-edgar-001"],
    freshnessWarnings: [],
    confidence: 0.85,
  },
  DEBATE_THESIS: {
    side: "BULL",
    thesis: "Strong earnings momentum supports a long position",
    conviction: 0.75,
    supportingRefs: ["sec-edgar-001"],
    counterArguments: ["Macro headwinds could compress multiples"],
  },
  SYNTHESIS: {
    rankedOpportunities: [
      {
        symbol: "AAPL",
        conviction: 0.8,
        bullCase: "Strong earnings momentum",
        bearCase: "Macro headwinds",
        suggestedSide: "BUY",
      },
    ],
    rejectedSymbols: ["TSLA"],
    overallUncertainty: "Moderate — macro environment unclear",
    summaryRationale: "AAPL shows strongest evidence across all analyst inputs",
  },
  PROPOSED_ORDERS: {
    rationale: "Strong buy signal on AAPL based on earnings beat",
    proposedOrders: [
      {
        symbol: "AAPL",
        side: "BUY",
        quantity: 10,
        orderType: "MARKET",
        rationale: "Earnings beat + positive sentiment",
        evidenceItemIds: ["sec-edgar-001"],
      },
    ],
  },
  RANKED_IDEAS: {
    rationale: "Ranked by conviction from synthesis",
    rankedIdeas: [
      {
        symbol: "AAPL",
        rank: 1,
        score: 82,
        rationale: "Top pick from synthesis",
        suggestedSide: "BUY",
      },
    ],
  },
  RISK_REVIEW: {
    concerns: ["Concentrated position in tech sector"],
    mitigations: ["Consider scaling into position over 3 days"],
    qualitativeRiskScore: "MEDIUM",
    note: "Overall risk is manageable given current portfolio context",
  },
  SENTIMENT_REPORT: {
    overall_band: "Bullish",
    overall_score: 7.2,
    confidence: "medium",
    narrative: "Social and news sentiment skew positive for AAPL.",
  },
};

describe("validateAgentOutput", () => {
  const outputTypes = Object.keys(OUTPUT_TYPE_SCHEMAS) as AgentOutputType[];

  for (const outputType of outputTypes) {
    it(`accepts valid ${outputType} output`, () => {
      expect(() => validateAgentOutput(outputType, validFixtures[outputType])).not.toThrow();
    });

    it(`rejects invalid ${outputType} output`, () => {
      expect(() => validateAgentOutput(outputType, { garbage: true })).toThrow(AgentOutputValidationError);
    });
  }

  it("rejects null", () => {
    expect(() => validateAgentOutput("EVIDENCE_ANALYSIS", null)).toThrow(AgentOutputValidationError);
  });

  it("rejects empty object", () => {
    expect(() => validateAgentOutput("DEBATE_THESIS", {})).toThrow(AgentOutputValidationError);
  });

  it("exposes the failed output type on validation errors", () => {
    try {
      validateAgentOutput("RISK_REVIEW", {});
      throw new Error("Expected validation to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(AgentOutputValidationError);
      expect((error as AgentOutputValidationError).outputType).toBe("RISK_REVIEW");
    }
  });
});
