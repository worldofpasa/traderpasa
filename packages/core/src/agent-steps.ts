import { Prisma } from "@pasa-trader/db";
import type { PrismaClient, AgentStepPhase, AgentStepStatus } from "@pasa-trader/db";

export interface StepCreateParams {
  jobRunId: string;
  phase: AgentStepPhase;
  stepIndex: number;
  name: string;
  role?: string;
  agentId?: string;
  metadata?: Record<string, unknown>;
}

export interface StepUpdateParams {
  status: AgentStepStatus;
  finishedAt?: Date;
  durationMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  outputData?: unknown;
  errorMessage?: string;
}

export async function createAgentStep(
  db: PrismaClient,
  params: StepCreateParams,
): Promise<string | null> {
  try {
    const step = await db.agentStep.create({
      data: {
        jobRunId: params.jobRunId,
        phase: params.phase,
        stepIndex: params.stepIndex,
        name: params.name,
        role: params.role ?? null,
        agentId: params.agentId ?? null,
        metadata: params.metadata
          ? (JSON.parse(JSON.stringify(params.metadata)) as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        status: "RUNNING",
        startedAt: new Date(),
      },
      select: { id: true },
    });
    return step.id;
  } catch {
    return null;
  }
}

export async function updateAgentStep(
  db: PrismaClient,
  stepId: string | null,
  params: StepUpdateParams,
): Promise<void> {
  if (!stepId) return;
  try {
    await db.agentStep.update({
      where: { id: stepId },
      data: {
        status: params.status,
        finishedAt: params.finishedAt ?? new Date(),
        durationMs: params.durationMs ?? null,
        promptTokens: params.promptTokens ?? null,
        completionTokens: params.completionTokens ?? null,
        outputData:
          params.outputData !== undefined
            ? (JSON.parse(JSON.stringify(params.outputData)) as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        errorMessage: params.errorMessage ?? null,
      },
    });
  } catch {
    // best-effort: never throw
  }
}

export async function markRemainingStepsSkipped(
  db: PrismaClient,
  jobRunId: string,
  fromStepIndex: number,
): Promise<void> {
  try {
    await db.agentStep.updateMany({
      where: {
        jobRunId,
        phase: "AGENT",
        stepIndex: { gte: fromStepIndex },
        status: "RUNNING",
      },
      data: {
        status: "SKIPPED",
        finishedAt: new Date(),
      },
    });
  } catch {
    // best-effort
  }
}
