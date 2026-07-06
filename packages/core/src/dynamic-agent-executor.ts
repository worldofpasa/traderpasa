import { getPrismaClient, type PrismaClient } from "@pasa-trader/db";
import { OpenAICompatibleModelAdapter } from "@pasa-trader/adapters";
import {
  generateWithRepairResult,
  OUTPUT_TYPE_SCHEMAS,
  OUTPUT_TYPE_SCHEMA_HINTS,
  type AgentContext,
} from "@pasa-trader/agents";
import {
  modelProviderCredentialSecretSchema,
  parseAgentTeamConfig as parseTeamConfig,
  getTeamExecution,
  TERMINAL_OUTPUT_TYPES,
  type AgentDefinition,
  type AgentTeamConfig,
  type AgentOutputType,
} from "@pasa-trader/schemas";
import { decryptCredentialSecret, getCredentialEncryptionKeyFromEnv } from "./credentials.js";
import { MissingModelCredentialError } from "./agent-workflows.js";
import { createAgentStep, updateAgentStep, markRemainingStepsSkipped } from "./agent-steps.js";
import { runTradingDeskTeam } from "./agent-debate-executor.js";
import { mergePrefetchIntoTopLevelVars, prefetchEvidenceForAgents } from "./agent-evidence-prefetch.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentRunRecord {
  agentId: string;
  agentName: string;
  role: string;
  outputType: AgentOutputType;
  output: unknown;
  credentialProvider: string;
  durationMs: number;
  promptTokens: number;
  completionTokens: number;
  repaired: boolean;
  error?: string;
}

export interface DynamicTeamResult {
  finalOutput: unknown;
  terminalOutputType: AgentOutputType;
  agentRuns: AgentRunRecord[];
}

export class DynamicAgentTeamError extends Error {
  constructor(message: string, readonly agentRuns: AgentRunRecord[]) {
    super(message);
    this.name = "DynamicAgentTeamError";
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface CredRow {
  id: string;
  provider: string;
  iv: string;
  encryptedPayload: string;
  authTag: string;
}

async function resolveCredential(
  credentialId: string | undefined,
  userId: string,
  db: PrismaClient,
): Promise<CredRow> {
  const where = credentialId
    ? { id: credentialId, userId, kind: "MODEL_PROVIDER" as const }
    : { userId, kind: "MODEL_PROVIDER" as const };

  const cred = await db.credential.findFirst({
    where,
    select: { id: true, provider: true, iv: true, encryptedPayload: true, authTag: true },
  });
  if (!cred) throw new MissingModelCredentialError();
  return cred;
}

function buildContext(
  cred: CredRow,
  loggingDepth: "METADATA" | "FULL",
  userId: string,
): AgentContext {
  return {
    modelAdapter: new OpenAICompatibleModelAdapter(cred.provider, () => {
      const secret = decryptCredentialSecret(
        { iv: cred.iv, encryptedPayload: cred.encryptedPayload, authTag: cred.authTag },
        getCredentialEncryptionKeyFromEnv(),
      );
      return Promise.resolve(modelProviderCredentialSecretSchema.parse(JSON.parse(secret)));
    }),
    credentialRef: { credentialId: cred.id, provider: cred.provider },
    loggingDepth,
    userId,
  };
}

/**
 * Substitute {{agentId.field}} and {{topLevelVar}} tokens in a template string.
 * topLevelVars covers strategy-level values like {{symbols}}, {{outputMode}}, {{evidenceItems}}.
 */
function substituteTemplate(
  template: string,
  intermediates: Map<string, unknown>,
  topLevelVars: Record<string, string>,
): string {
  // eslint-disable-next-line complexity
  return template.replace(/\{\{([^}]+)\}\}/g, (match: string, token: string) => {
    const parts = token.trim().split(".");
    if (parts.length === 2) {
      const [agentId, field] = parts as [string, string];
      const agentOutput = intermediates.get(agentId);
      if (agentOutput && typeof agentOutput === "object" && field in (agentOutput as Record<string, unknown>)) {
        const val = (agentOutput as Record<string, unknown>)[field];
        if (val === undefined) return match;
        const serialized = typeof val === "string" ? val : JSON.stringify(val);
        return serialized;
      }
      // Fallback: serialize the whole agent output
      if (agentOutput !== undefined) {
        const serialized = JSON.stringify(agentOutput);
        return serialized;
      }
    }
    if (parts.length === 1) {
      const [key] = parts;
      if (key !== undefined && key in topLevelVars) return topLevelVars[key] ?? match;
    }
    return match; // leave unresolved tokens as-is
  });
}

// ─── Resume options ───────────────────────────────────────────────────────────

export interface ResumeOptions {
  startFromStepIndex: number;
  preloadedIntermediates: Map<string, unknown>;
}

// ─── Wave computation ─────────────────────────────────────────────────────────

/**
 * Groups enabled agents into parallel waves using topological sort.
 * Agents in the same wave have no dependencies on each other and can run concurrently.
 */
function computeWaves(agents: AgentDefinition[]): AgentDefinition[][] {
  const enabledIds = new Set(agents.map((a) => a.id));
  const completed = new Set<string>();
  const pending = [...agents]; // already sorted by order
  const waves: AgentDefinition[][] = [];

  while (pending.length > 0) {
    const wave = pending.filter((a) =>
      a.handoffFrom.filter((id) => enabledIds.has(id)).every((id) => completed.has(id)),
    );
    if (wave.length === 0) {
      // Cycle or unresolvable deps — run remaining in insertion order
      waves.push(...pending.map((a) => [a]));
      break;
    }
    waves.push(wave);
    for (const a of wave) {
      completed.add(a.id);
      pending.splice(pending.indexOf(a), 1);
    }
  }

  return waves;
}

// ─── Single-agent execution ───────────────────────────────────────────────────

interface SingleAgentResult {
  run: AgentRunRecord;
  output: unknown;
}

export async function executeAgentDefinition(
  agent: AgentDefinition,
  stepIndex: number,
  intermediates: Map<string, unknown>,
  topLevelVars: Record<string, string>,
  userId: string,
  loggingDepth: "METADATA" | "FULL",
  db: PrismaClient,
  jobRunId: string | undefined,
): Promise<SingleAgentResult> {
  const cred = await resolveCredential(agent.credentialId, userId, db);
  const context = buildContext(cred, loggingDepth, userId);

  const systemPrompt = substituteTemplate(agent.systemPrompt, intermediates, topLevelVars);
  const userPrompt = substituteTemplate(agent.userPromptTemplate, intermediates, topLevelVars);

  const schema = OUTPUT_TYPE_SCHEMAS[agent.outputType];
  const schemaHint = OUTPUT_TYPE_SCHEMA_HINTS[agent.outputType];
  const start = Date.now();

  const stepId = jobRunId
    ? await createAgentStep(db, {
        jobRunId,
        phase: "AGENT",
        stepIndex,
        name: agent.name,
        role: agent.role,
        agentId: agent.id,
        metadata: { credentialProvider: cred.provider, outputType: agent.outputType },
      })
    : null;

  try {
    const result = await generateWithRepairResult(context, systemPrompt, userPrompt, schema, undefined, schemaHint);
    const durationMs = Date.now() - start;

    await updateAgentStep(db, stepId, {
      status: "COMPLETED",
      durationMs,
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      outputData: result.output as never,
    });

    return {
      output: result.output,
      run: {
        agentId: agent.id,
        agentName: agent.name,
        role: agent.role,
        outputType: agent.outputType,
        output: result.output,
        credentialProvider: cred.provider,
        durationMs,
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        repaired: result.repaired,
      },
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - start;

    await updateAgentStep(db, stepId, {
      status: "FAILED",
      durationMs,
      errorMessage: errMsg,
    });

    return {
      output: null,
      run: {
        agentId: agent.id,
        agentName: agent.name,
        role: agent.role,
        outputType: agent.outputType,
        output: null,
        credentialProvider: cred.provider,
        durationMs,
        promptTokens: 0,
        completionTokens: 0,
        repaired: true,
        error: errMsg,
      },
    };
  }
}

// ─── Main executor ────────────────────────────────────────────────────────────

export async function runDynamicAgentTeam(
  teamConfig: AgentTeamConfig,
  topLevelVars: Record<string, string>,
  userId: string,
  loggingDepth: "METADATA" | "FULL",
  db: PrismaClient = getPrismaClient(),
  jobRunId?: string,
  resumeOptions?: ResumeOptions,
): Promise<DynamicTeamResult> {
  const execution = getTeamExecution(teamConfig);
  if (execution.mode === "TRADING_DESK") {
    return runTradingDeskTeam(
      teamConfig,
      topLevelVars,
      userId,
      loggingDepth,
      db,
      jobRunId,
      resumeOptions,
    );
  }

  const agents = [...teamConfig.agents]
    .filter((a) => a.enabled)
    .sort((a, b) => a.order - b.order);

  const mergedTopLevelVars = mergePrefetchIntoTopLevelVars(
    topLevelVars,
    prefetchEvidenceForAgents(agents, {
      symbols: (topLevelVars.symbols ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      tradeDate: topLevelVars.trade_date ?? new Date().toISOString().slice(0, 10),
      evidenceItemsJson: topLevelVars.evidenceItems ?? "[]",
    }),
  );

  if (agents.length === 0) {
    throw new Error("Agent team has no enabled agents.");
  }

  const lastAgent = agents.at(-1) as AgentDefinition | undefined;
  if (!lastAgent) {
    throw new Error("Agent team has no enabled agents.");
  }
  if (!TERMINAL_OUTPUT_TYPES.includes(lastAgent.outputType)) {
    throw new Error(
      `Agent team pipeline must end with a terminal output type (${TERMINAL_OUTPUT_TYPES.join(", ")}). ` +
      `Last agent "${lastAgent.name}" outputs "${lastAgent.outputType}".`,
    );
  }

  // Pre-assign flat step indices in topological wave order
  const waves = computeWaves(agents);
  const stepIndexOf = new Map<string, number>();
  let stepCounter = 0;
  for (const wave of waves) {
    for (const agent of wave) {
      stepIndexOf.set(agent.id, stepCounter++);
    }
  }

  // Seed intermediates from resume preload
  const intermediates: Map<string, unknown> = resumeOptions
    ? new Map(resumeOptions.preloadedIntermediates)
    : new Map();
  const agentRuns: AgentRunRecord[] = [];

  for (const wave of waves) {
    // Skip completed steps when resuming
    const waveToRun = wave.filter((a) => {
      const idx = stepIndexOf.get(a.id) ?? 0;
      if (resumeOptions && idx < resumeOptions.startFromStepIndex) {
        agentRuns.push({
          agentId: a.id,
          agentName: a.name,
          role: a.role,
          outputType: a.outputType,
          output: intermediates.get(a.id) ?? null,
          credentialProvider: "resumed",
          durationMs: 0,
          promptTokens: 0,
          completionTokens: 0,
          repaired: false,
        });
        return false;
      }
      return true;
    });

    if (waveToRun.length === 0) continue;

    // Run all agents in this wave in parallel
    const waveResults = await Promise.allSettled(
      waveToRun.map((agent) =>
        executeAgentDefinition(
          agent,
          stepIndexOf.get(agent.id) ?? 0,
          // Pass a snapshot of intermediates so all agents in the wave read the same state
          new Map(intermediates),
          mergedTopLevelVars,
          userId,
          loggingDepth,
          db,
          jobRunId,
        ),
      ),
    );

    // Collect results, detect failures
    let firstFailedAgent: AgentDefinition | null = null;
    let firstFailureRun: AgentRunRecord | null = null;

    for (let i = 0; i < waveResults.length; i++) {
      const result = waveResults[i]!;
      const agent = waveToRun[i]!;

      if (result.status === "fulfilled") {
        intermediates.set(agent.id, result.value.output);
        agentRuns.push(result.value.run);
      } else {
        // Unexpected rejection (runSingleAgent returns on error, so this is a system error)
        const errMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
        const failRun: AgentRunRecord = {
          agentId: agent.id,
          agentName: agent.name,
          role: agent.role,
          outputType: agent.outputType,
          output: null,
          credentialProvider: "unknown",
          durationMs: 0,
          promptTokens: 0,
          completionTokens: 0,
          repaired: true,
          error: errMsg,
        };
        agentRuns.push(failRun);
        if (!firstFailedAgent) {
          firstFailedAgent = agent;
          firstFailureRun = failRun;
        }
      }

      // Also check for error in the fulfilled run record
      const runRecord = result.status === "fulfilled" ? result.value.run : null;
      if (runRecord?.error && !firstFailedAgent) {
        firstFailedAgent = agent;
        firstFailureRun = runRecord;
      }
    }

    if (firstFailedAgent && firstFailureRun) {
      const nextStepIdx = (stepIndexOf.get(firstFailedAgent.id) ?? 0) + 1;
      if (jobRunId) {
        await markRemainingStepsSkipped(db, jobRunId, nextStepIdx);
      }
      throw new DynamicAgentTeamError(
        `Agent "${firstFailedAgent.name}" failed: ${firstFailureRun.error ?? "unknown error"}`,
        agentRuns,
      );
    }
  }

  const finalOutput = intermediates.get(lastAgent.id);

  return {
    finalOutput,
    terminalOutputType: lastAgent.outputType,
    agentRuns,
  };
}

/**
 * Parse and validate agentTeamConfig JSON from a strategy instance.
 * Returns null if the config is empty or missing (use legacy flow).
 */
export { parseTeamConfig as parseAgentTeamConfig };
