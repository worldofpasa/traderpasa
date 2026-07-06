import type { AgentStep } from "@pasa-trader/db";

type StepStatus = AgentStep["status"];

// Token cost rates per 1M tokens (prompt / completion)
const PROVIDER_RATES: Record<string, [number, number]> = {
  openai: [5, 15],
  anthropic: [3, 15],
  local: [0, 0],
};

function getRates(provider?: string | null): [number, number] {
  if (!provider) return [0, 0];
  for (const [key, rates] of Object.entries(PROVIDER_RATES)) {
    if (provider.toLowerCase().includes(key)) return rates;
  }
  return [0, 0];
}

export interface TokenStats {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  estimatedCostUsd: number | null;
}

export function computeTokenStats(steps: AgentStep[]): TokenStats {
  let totalPrompt = 0;
  let totalCompletion = 0;
  let costKnown = false;
  let totalCost = 0;

  for (const step of steps) {
    if (step.promptTokens) totalPrompt += step.promptTokens;
    if (step.completionTokens) totalCompletion += step.completionTokens;

    const meta = step.metadata as Record<string, unknown> | null;
    const provider = meta?.credentialProvider as string | undefined;
    if (provider) {
      costKnown = true;
      const [promptRate, completionRate] = getRates(provider);
      totalCost +=
        ((step.promptTokens ?? 0) * promptRate) / 1_000_000 +
        ((step.completionTokens ?? 0) * completionRate) / 1_000_000;
    }
  }

  return {
    totalPromptTokens: totalPrompt,
    totalCompletionTokens: totalCompletion,
    estimatedCostUsd: costKnown ? Math.round(totalCost * 10_000) / 10_000 : null,
  };
}

export interface ResumePoint {
  startFromStepIndex: number;
  preloadedIntermediates: Map<string, unknown>;
}

export function getResumePoint(steps: AgentStep[]): ResumePoint | null {
  const agentSteps = steps
    .filter((s) => s.phase === "AGENT")
    .sort((a, b) => a.stepIndex - b.stepIndex);

  if (agentSteps.length === 0) return null;

  // Find first failed/skipped step where all prior steps have outputData
  let resumeIndex: number | null = null;
  const intermediates = new Map<string, unknown>();

  for (const step of agentSteps) {
    const isFailed: boolean = step.status === "FAILED" || step.status === "SKIPPED";
    if (!isFailed && step.outputData !== null && step.outputData !== undefined && step.agentId) {
      intermediates.set(step.agentId, step.outputData);
    } else if (isFailed) {
      resumeIndex = step.stepIndex;
      break;
    }
  }

  if (resumeIndex === null) return null;

  return { startFromStepIndex: resumeIndex, preloadedIntermediates: intermediates };
}

type JobRunStatus =
  | "RUNNING"
  | "COMPLETED"
  | "PARTIAL"
  | "NEEDS_ACTION"
  | "SKIPPED"
  | "FAILED"
  | "RETRYING";

export function computeJobRunStatus(
  steps: AgentStep[],
  outputMode: string,
  executionResult: string,
): JobRunStatus {
  const evidenceSteps = steps.filter((s) => s.phase === "EVIDENCE");
  const agentSteps = steps.filter((s) => s.phase === "AGENT");

  // Required evidence failure → hard FAILED
  const requiredEvidenceFailed = evidenceSteps.some((s) => {
    const meta = s.metadata as Record<string, unknown> | null;
    return meta?.required === true && s.status === "FAILED";
  });
  if (requiredEvidenceFailed) return "FAILED";

  // Any agent step hard-failed → FAILED
  const anyAgentFailed = agentSteps.some((s) => s.status === "FAILED");
  if (anyAgentFailed) return "FAILED";

  // Session gated or live acknowledgment missing → NEEDS_ACTION
  if (
    executionResult.startsWith("session_gated") ||
    executionResult === "live_acknowledgment_missing"
  ) {
    return "NEEDS_ACTION";
  }

  // Risk blocked → PARTIAL
  if (executionResult === "risk_blocked") return "PARTIAL";

  // All agents completed
  const allAgentsCompleted = agentSteps.length > 0 && agentSteps.every((s) => s.status === "COMPLETED" || s.status === "PARTIAL");
  const evidenceDegraded = evidenceSteps.some((s) => s.status === "PARTIAL" || s.status === "FAILED");

  if (outputMode === "RANKED_IDEAS") {
    if (allAgentsCompleted) return evidenceDegraded ? "PARTIAL" : "COMPLETED";
  }

  if (executionResult === "executed") {
    if (allAgentsCompleted) return evidenceDegraded ? "PARTIAL" : "COMPLETED";
    return "PARTIAL";
  }

  if (executionResult === "no_orders_generated_or_ranked_ideas_mode" || executionResult === "skipped") {
    if (agentSteps.length === 0) return "SKIPPED";
    if (allAgentsCompleted) return evidenceDegraded ? "PARTIAL" : "COMPLETED";
  }

  return "COMPLETED";
}
