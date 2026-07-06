import { getPrismaClient } from "@pasa-trader/db";
import { getCurrentUser } from "../../../current-user";
import { computeTokenStats, getResumePoint } from "@pasa-trader/core";

const PHASE_ORDER: Record<string, number> = {
  EVIDENCE: 0,
  AGENT: 1,
  RISK: 2,
  EXECUTION: 3,
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json(
      { error: { code: "unauthorized", message: "Authentication is required." } },
      { status: 401 },
    );
  }

  const { id } = await params;
  const db = getPrismaClient();

  const run = await db.jobRun.findUnique({
    where: { id },
    include: {
      strategyInstance: {
        select: {
          id: true,
          name: true,
          userId: true,
          outputMode: true,
          executionMode: true,
        },
      },
      agentSteps: {
        orderBy: [{ phase: "asc" }, { stepIndex: "asc" }],
      },
      orderPackets: {
        select: {
          id: true,
          status: true,
          rationale: true,
          uncertaintyNote: true,
          agentRunMetadata: true,
          createdAt: true,
          proposedOrders: {
            select: {
              id: true,
              symbol: true,
              side: true,
              quantity: true,
              orderType: true,
              limitPrice: true,
              rationale: true,
              status: true,
              riskResult: true,
            },
          },
        },
        take: 1,
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!run) {
    return Response.json(
      { error: { code: "not_found", message: "Run not found." } },
      { status: 404 },
    );
  }

  if (run.strategyInstance?.userId !== user.id) {
    return Response.json(
      { error: { code: "not_found", message: "Run not found." } },
      { status: 404 },
    );
  }

  const steps = run.agentSteps;
  const tokenStats = computeTokenStats(steps);
  const resumePoint = getResumePoint(steps);

  // Sort steps by phase order then stepIndex
  const sortedSteps = [...steps].sort((a, b) => {
    const phaseDiff = (PHASE_ORDER[a.phase] ?? 99) - (PHASE_ORDER[b.phase] ?? 99);
    if (phaseDiff !== 0) return phaseDiff;
    return a.stepIndex - b.stepIndex;
  });

  const packet = run.orderPackets[0] ?? null;

  // Legacy trace fallback for runs that predate AgentStep tracking
  const legacyTrace =
    steps.length === 0 && packet?.agentRunMetadata ? packet.agentRunMetadata : null;

  const outputRefs = run.outputRefs as Record<string, unknown> | null;

  return Response.json({
    run: {
      id: run.id,
      jobType: run.jobType,
      status: run.status,
      errorCode: run.errorCode,
      errorMessage: run.errorMessage,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      durationMs: run.durationMs,
      createdAt: run.createdAt,
      resumedFromJobRunId: run.resumedFromJobRunId,
      outputRefs,
    },
    strategy: run.strategyInstance
      ? {
          id: run.strategyInstance.id,
          name: run.strategyInstance.name,
          outputMode: run.strategyInstance.outputMode,
          executionMode: run.strategyInstance.executionMode,
        }
      : null,
    steps: sortedSteps.map((s) => ({
      id: s.id,
      phase: s.phase,
      stepIndex: s.stepIndex,
      name: s.name,
      role: s.role,
      agentId: s.agentId,
      status: s.status,
      startedAt: s.startedAt,
      finishedAt: s.finishedAt,
      durationMs: s.durationMs,
      promptTokens: s.promptTokens,
      completionTokens: s.completionTokens,
      outputData: s.outputData,
      errorMessage: s.errorMessage,
      metadata: s.metadata,
    })),
    packet: packet
      ? {
          id: packet.id,
          status: packet.status,
          rationale: packet.rationale,
          uncertaintyNote: packet.uncertaintyNote,
          createdAt: packet.createdAt,
          orderCount: packet.proposedOrders.length,
          orders: packet.proposedOrders,
        }
      : null,
    tokenStats,
    resumeAvailable: !!resumePoint,
    resumeFromStepIndex: resumePoint?.startFromStepIndex ?? null,
    legacyTrace,
  });
}
