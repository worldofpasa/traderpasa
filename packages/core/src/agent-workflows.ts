import { getPrismaClient, type Prisma, type PrismaClient, type ProposedOrderPacket, type ProposedOrder } from "@pasa-trader/db";
import {
  OpenAICompatibleModelAdapter,
  type ModelProviderAdapter,
} from "@pasa-trader/adapters";
import {
  AgentWorkflowExecutor,
  EvidenceSummarizerStep,
  OrderGenerationStep,
  type AgentContext,
  orderGenerationSchema,
} from "@pasa-trader/agents";
import { decryptCredentialSecret, getCredentialEncryptionKeyFromEnv } from "./credentials.js";
import { modelProviderCredentialSecretSchema, stepModelConfigSchema } from "@pasa-trader/schemas";
import { DynamicAgentTeamError, runDynamicAgentTeam, parseAgentTeamConfig, type DynamicTeamResult, type ResumeOptions } from "./dynamic-agent-executor.js";
import { buildSourcePolicyContext } from "./source-policy.js";

export class MissingModelCredentialError extends Error {
  constructor() {
    super("No model provider credential configured for user.");
    this.name = "MissingModelCredentialError";
  }
}

export class RequiredEvidenceFailedError extends Error {
  constructor() {
    super("Cannot run agent synthesis: required evidence collection failed.");
    this.name = "RequiredEvidenceFailedError";
  }
}

export class MissingLinkedAccountError extends Error {
  constructor() {
    super("Strategy instance does not have a linked broker account.");
    this.name = "MissingLinkedAccountError";
  }
}

interface CredentialRow {
  id: string;
  provider: string;
  iv: string;
  encryptedPayload: string;
  authTag: string;
}

function buildModelContext(
  credential: CredentialRow,
  loggingDepth: "METADATA" | "FULL",
  userId: string,
): AgentContext {
  const decryptKeys = () => {
    const secret = decryptCredentialSecret(
      { iv: credential.iv, encryptedPayload: credential.encryptedPayload, authTag: credential.authTag },
      getCredentialEncryptionKeyFromEnv(),
    );
    return Promise.resolve(modelProviderCredentialSecretSchema.parse(JSON.parse(secret)));
  };

  const modelAdapter: ModelProviderAdapter = new OpenAICompatibleModelAdapter(
    credential.provider,
    decryptKeys,
  );

  return {
    modelAdapter,
    credentialRef: { credentialId: credential.id, provider: credential.provider },
    loggingDepth,
    userId,
  };
}

// eslint-disable-next-line complexity
export async function runStrategyAgentWorkflow(
  strategyInstanceId: string,
  evidenceBundleId: string,
  db: PrismaClient = getPrismaClient(),
  jobRunId?: string,
  resumeOptions?: ResumeOptions,
): Promise<(ProposedOrderPacket & { proposedOrders: ProposedOrder[] }) | null> {
  const strategy = await db.strategyInstance.findUnique({
    where: { id: strategyInstanceId },
    include: { brokerAccount: true },
  });

  if (!strategy || strategy.status === "DELETED") {
    throw new Error("Strategy instance not found or deleted.");
  }

  if (!strategy.brokerAccountId) {
    throw new MissingLinkedAccountError();
  }
  const brokerAccountId = strategy.brokerAccountId;
  const strategyUserId = strategy.userId;

  const bundle = await db.evidenceBundle.findUnique({
    where: { id: evidenceBundleId },
    include: { evidenceItems: true },
  });

  if (!bundle) {
    throw new Error("Evidence bundle not found.");
  }

  // P3-S9 / P5-S7 Check: Required evidence failure blocks executable flow
  if (bundle.status === "FAILED") {
    throw new RequiredEvidenceFailedError();
  }

  // ── Dynamic agent team path ──────────────────────────────────────────────
  const teamConfig = parseAgentTeamConfig(strategy.agentTeamConfig);
  if (teamConfig) {
    const evidenceItemsJson = JSON.stringify(
      bundle.evidenceItems.map((item) => ({
        id: item.id,
        sourceId: item.sourceId,
        sourceName: item.sourceName,
        reliabilityClass: item.reliabilityClass,
        observedAt: item.observedAt.toISOString(),
        staleAt: item.staleAt?.toISOString() ?? null,
        title: item.title,
        summary: item.summary,
        warnings: item.warnings,
      })),
      null,
      2,
    );

    // Source-policy context pack (#106): reliability, status, and TTL per source.
    const sourcePolicy = buildSourcePolicyContext({
      sourceConfig: strategy.sourceConfig as Record<string, { enabled: boolean; required: boolean }> | null,
      sourceResults: bundle.sourceResults as Record<string, string> | null,
      evidenceItems: bundle.evidenceItems,
    });

    const topLevelVars: Record<string, string> = {
      evidenceItems: evidenceItemsJson,
      symbols: strategy.symbols.join(", "),
      outputMode: strategy.outputMode,
      side: "BULL",
      trade_date: new Date().toISOString().slice(0, 10),
      source_policy_block: sourcePolicy.block,
    };

    try {
      const teamResult = await runDynamicAgentTeam(
        teamConfig,
        topLevelVars,
        strategy.userId,
        strategy.modelLoggingDepth,
        db,
        jobRunId,
        resumeOptions,
      );

      return await persistDynamicResult(
        teamResult,
        strategyInstanceId,
        evidenceBundleId,
        strategy.outputMode,
        strategy.executionMode,
        brokerAccountId,
        jobRunId,
        db,
      );
    } catch (error) {
      if (error instanceof DynamicAgentTeamError) {
        await persistFailedDynamicResult(
          error,
          strategyInstanceId,
          evidenceBundleId,
          jobRunId,
          db,
        );
      }
      throw error;
    }
  }

  // ── Legacy 2-step path ───────────────────────────────────────────────────
  // Parse per-step model config (credential IDs per step name)
  const stepConfig = stepModelConfigSchema.catch({}).parse(strategy.stepModelConfig ?? {});

  // Resolve credentials: per-step first, then fallback to first MODEL_PROVIDER credential
  const credSelect = { id: true, provider: true, iv: true, encryptedPayload: true, authTag: true } as const;

  async function resolveStepCredential(stepCredentialId: string | undefined): Promise<CredentialRow> {
    if (stepCredentialId) {
      const cred = await db.credential.findFirst({
        where: { id: stepCredentialId, userId: strategyUserId, kind: "MODEL_PROVIDER" },
        select: credSelect,
      });
      if (cred) return cred;
    }
    const fallback = await db.credential.findFirst({
      where: { userId: strategyUserId, kind: "MODEL_PROVIDER" },
      select: credSelect,
    });
    if (!fallback) throw new MissingModelCredentialError();
    return fallback;
  }

  const [summarizerCred, orderGenCred] = await Promise.all([
    resolveStepCredential(stepConfig.summarizer),
    resolveStepCredential(stepConfig.orderGeneration),
  ]);

  const defaultContext = buildModelContext(summarizerCred, strategy.modelLoggingDepth, strategy.userId);
  const executor = new AgentWorkflowExecutor(defaultContext);

  // Step 1: Summarize evidence (potentially a cheap/local model)
  const summarizerInput = bundle.evidenceItems.map((item) => ({
    id: item.id,
    sourceId: item.sourceId,
    sourceName: item.sourceName,
    observedAt: item.observedAt.toISOString(),
    title: item.title,
    summary: item.summary,
    warnings: item.warnings,
  }));

  const summarizerOverride = summarizerCred.id !== orderGenCred.id
    ? buildModelContext(summarizerCred, strategy.modelLoggingDepth, strategy.userId)
    : undefined;

  const summaryResult = await executor.runStep(
    new EvidenceSummarizerStep(),
    summarizerInput,
    summarizerOverride,
  );

  // Step 2: Generate proposed orders/ideas (potentially a premium cloud model)
  const generationInput = {
    summaryText: summaryResult.summary,
    symbols: strategy.symbols,
    outputMode: strategy.outputMode,
  };

  const orderGenOverride = orderGenCred.id !== summarizerCred.id
    ? buildModelContext(orderGenCred, strategy.modelLoggingDepth, strategy.userId)
    : undefined;

  const generationResult = await executor.runStep(
    new OrderGenerationStep(),
    generationInput,
    orderGenOverride,
  );

  // Persist ProposedOrderPacket & ProposedOrders in DB
  return await db.$transaction(async (tx) => {
    const packet = await tx.proposedOrderPacket.create({
      data: {
        strategyInstanceId,
        evidenceBundleId,
        jobRunId: jobRunId ?? null,
        status: "DRAFT",
        rationale: generationResult.rationale,
        uncertaintyNote: generationResult.uncertaintyNote ?? null,
        agentRunMetadata: {
          summary: summaryResult.summary,
          citations: summaryResult.citations,
          sourceWarnings: summaryResult.sourceWarnings,
          summarizerProvider: summarizerCred.provider,
          orderGenProvider: orderGenCred.provider,
        },
      },
    });

    if (generationResult.proposedOrders.length > 0) {
      for (const order of generationResult.proposedOrders) {
        await tx.proposedOrder.create({
          data: {
            packetId: packet.id,
            symbol: order.symbol,
            side: order.side,
            quantity: order.quantity,
            orderType: order.orderType,
            limitPrice: order.limitPrice ?? null,
            environment: strategy.executionMode,
            brokerAccountId,
            rationale: order.rationale,
            evidenceItemIds: order.evidenceItemIds,
          },
        });
      }
    }

    return tx.proposedOrderPacket.findUnique({
      where: { id: packet.id },
      include: { proposedOrders: true },
    });
  });
}
// ─── Dynamic path persistence ─────────────────────────────────────────────────

async function persistFailedDynamicResult(
  error: DynamicAgentTeamError,
  strategyInstanceId: string,
  evidenceBundleId: string,
  jobRunId: string | undefined,
  db: PrismaClient,
): Promise<void> {
  await db.proposedOrderPacket.create({
    data: {
      strategyInstanceId,
      evidenceBundleId,
      jobRunId: jobRunId ?? null,
      status: "REJECTED",
      rationale: "Agent team failed before producing schema-valid terminal output.",
      uncertaintyNote: error.message,
      agentRunMetadata: JSON.parse(JSON.stringify({
        teamVersion: 1,
        terminalOutputType: null,
        agentRuns: error.agentRuns,
      })) as Prisma.InputJsonObject,
    },
  });
}

async function persistDynamicResult(
  teamResult: DynamicTeamResult,
  strategyInstanceId: string,
  evidenceBundleId: string,
  outputMode: string,
  executionMode: string,
  brokerAccountId: string,
  jobRunId: string | undefined,
  db: PrismaClient,
): Promise<(ProposedOrderPacket & { proposedOrders: ProposedOrder[] }) | null> {
  const { finalOutput, terminalOutputType, agentRuns } = teamResult;

  // Extract orders/rationale from terminal output
  let rationale = "";
  let uncertaintyNote: string | null = null;
  let orders: {
    symbol: string; side: string; quantity: number; orderType: string;
    limitPrice?: number | undefined; rationale: string; evidenceItemIds: string[];
  }[] = [];

  if (terminalOutputType === "PROPOSED_ORDERS") {
    const parsed = orderGenerationSchema.safeParse(finalOutput);
    if (parsed.success) {
      rationale = parsed.data.rationale;
      uncertaintyNote = parsed.data.uncertaintyNote ?? null;
      orders = parsed.data.proposedOrders;
    }
  } else if (terminalOutputType === "RANKED_IDEAS") {
    const ideas = finalOutput as { rationale?: string; uncertaintyNote?: string };
    rationale = ideas.rationale ?? "Ranked ideas generated.";
    uncertaintyNote = ideas.uncertaintyNote ?? null;
  } else if (terminalOutputType === "SYNTHESIS") {
    const synthesis = finalOutput as { summaryRationale?: string; overallUncertainty?: string };
    rationale = synthesis.summaryRationale ?? "Research synthesis completed.";
    uncertaintyNote = synthesis.overallUncertainty ?? null;
  }

  return await db.$transaction(async (tx) => {
    const packet = await tx.proposedOrderPacket.create({
      data: {
        strategyInstanceId,
        evidenceBundleId,
        jobRunId: jobRunId ?? null,
        status: "DRAFT",
        rationale,
        uncertaintyNote,
        agentRunMetadata: JSON.parse(JSON.stringify({ teamVersion: 1, terminalOutputType, agentRuns })) as Prisma.InputJsonObject,
      },
    });

    if (orders.length > 0) {
      for (const order of orders) {
        await tx.proposedOrder.create({
          data: {
            packetId: packet.id,
            symbol: order.symbol,
            side: order.side as "BUY" | "SELL" | "SELL_SHORT" | "BUY_TO_COVER",
            quantity: order.quantity,
            orderType: order.orderType as "MARKET" | "LIMIT",
            limitPrice: order.limitPrice ?? null,
            environment: executionMode as "PAPER" | "LIVE",
            brokerAccountId,
            rationale: order.rationale,
            evidenceItemIds: order.evidenceItemIds,
          },
        });
      }
    }

    return tx.proposedOrderPacket.findUnique({
      where: { id: packet.id },
      include: { proposedOrders: true },
    });
  });
}
