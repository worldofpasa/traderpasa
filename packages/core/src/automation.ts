import { getPrismaClient, type PrismaClient, Prisma } from "@pasa-trader/db";
import { collectEvidenceForStrategy } from "./evidence.js";
import { runStrategyAgentWorkflow } from "./agent-workflows.js";
import { validateRiskForPacket } from "./risk.js";
import { executePacket } from "./execution.js";
import { createAgentStep, updateAgentStep } from "./agent-steps.js";
import { computeJobRunStatus, getResumePoint } from "./run-status.js";
import type { ResumeOptions } from "./dynamic-agent-executor.js";

export interface MarketSessionRules {
  sessionOnly?: boolean;
  allowPreMarket?: boolean;
  allowAfterHours?: boolean;
}

export function checkMarketSessionRules(rules: MarketSessionRules | null | undefined): { allowed: boolean; reason?: string } {
  if (!rules || !rules.sessionOnly) {
    return { allowed: true };
  }

  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });

  let parts;
  try {
    parts = formatter.formatToParts(now);
  } catch (err) {
    return { allowed: true }; // Fallback to allowed if timezone isn't supported
  }

  const getPart = (type: string) => parseInt(parts.find(p => p.type === type)?.value || "0", 10);

  const year = getPart("year");
  const month = getPart("month") - 1; // JS months are 0-11
  const day = getPart("day");
  const hour = getPart("hour");
  const minute = getPart("minute");

  // Determine day of week in NY
  const nyDate = new Date(Date.UTC(year, month, day, hour, minute));
  const dayOfWeek = nyDate.getUTCDay();

  // Weekend check (0 = Sunday, 6 = Saturday)
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return { allowed: false, reason: "Market is closed on weekends." };
  }

  const minutesSinceMidnight = hour * 60 + minute;

  // Regular market hours: 9:30 AM to 4:00 PM (570 to 960 minutes)
  const regularStart = 9 * 60 + 30;
  const regularEnd = 16 * 60;

  // Pre-market hours: 4:00 AM to 9:30 AM (240 to 570 minutes)
  const preStart = 4 * 60;
  const preEnd = 9 * 60 + 30;

  // After-hours: 4:00 PM to 8:00 PM (960 to 1200 minutes)
  const afterStart = 16 * 60;
  const afterEnd = 20 * 60;

  const isRegular = minutesSinceMidnight >= regularStart && minutesSinceMidnight < regularEnd;
  const isPre = minutesSinceMidnight >= preStart && minutesSinceMidnight < preEnd;
  const isAfter = minutesSinceMidnight >= afterStart && minutesSinceMidnight < afterEnd;

  if (isRegular) {
    return { allowed: true };
  }

  if (isPre && rules.allowPreMarket) {
    return { allowed: true };
  }

  if (isAfter && rules.allowAfterHours) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `Current time (${hour}:${String(minute).padStart(2, "0")} ET) is outside allowed market sessions. (Pre-market allowed: ${!!rules.allowPreMarket}, After-hours allowed: ${!!rules.allowAfterHours})`,
  };
}

export async function executeScheduledStrategyRun(
  strategyId: string,
  db: PrismaClient = getPrismaClient(),
  options: { checkMissedRun?: boolean; scheduledTime?: Date; resumedFromJobRunId?: string } = {},
): Promise<void> {
  const startedAt = new Date();

  // Create JobRun record
  const jobRun = await db.jobRun.create({
    data: {
      jobType: "strategy.run",
      queue: "default",
      strategyInstanceId: strategyId,
      status: "RUNNING",
      startedAt,
      resumedFromJobRunId: options.resumedFromJobRunId ?? null,
    },
  });

  try {
    const strategy = await db.strategyInstance.findUnique({
      where: { id: strategyId },
    });

    if (!strategy || strategy.status === "DELETED") {
      await db.jobRun.update({
        where: { id: jobRun.id },
        data: {
          status: "FAILED",
          errorCode: "STRATEGY_NOT_FOUND",
          errorMessage: "Strategy not found or was deleted.",
          finishedAt: new Date(),
          durationMs: Date.now() - startedAt.getTime(),
        },
      });
      return;
    }

    if (strategy.status === "DISABLED") {
      // Missed run behavior: simply complete successfully but with skipped payload
      await db.jobRun.update({
        where: { id: jobRun.id },
        data: {
          status: "COMPLETED",
          finishedAt: new Date(),
          durationMs: Date.now() - startedAt.getTime(),
          outputRefs: { skipped: "Strategy is currently disabled." } as Prisma.InputJsonValue,
        },
      });
      return;
    }

    // P7-S4 Missed-run behavior: defaults to no action/skip if scheduled time is too old
    if (options.checkMissedRun && options.scheduledTime) {
      const timeDiffMs = Date.now() - new Date(options.scheduledTime).getTime();
      const tenMinutes = 10 * 60 * 1000;
      
      // Default missed-run behavior: do not execute/backfill if scheduled more than 10 mins ago
      // unless strategy explicitly configures allowMissedBackfill: true (not standard in schemas, so we default to skip)
      if (timeDiffMs > tenMinutes) {
        await db.jobRun.update({
          where: { id: jobRun.id },
          data: {
            status: "COMPLETED",
            finishedAt: new Date(),
            durationMs: Date.now() - startedAt.getTime(),
            outputRefs: { skipped: "Missed run blocked. Scheduled time is too far in the past." } as Prisma.InputJsonValue,
          },
        });
        
        await db.auditLog.create({
          data: {
            actorType: "SYSTEM",
            action: "strategy.missed_run_ignored",
            target: `strategy_instance:${strategyId}`,
            metadata: { scheduledTime: options.scheduledTime, timeDiffMs },
          },
        });
        return;
      }
    }

    // ── Resume: if this run is a retry, reuse prior evidence & agent steps ──
    let resumeOptions: ResumeOptions | undefined;
    if (options.resumedFromJobRunId) {
      const priorSteps = await db.agentStep.findMany({
        where: { jobRunId: options.resumedFromJobRunId },
        orderBy: [{ phase: "asc" }, { stepIndex: "asc" }],
      });
      const point = getResumePoint(priorSteps);
      if (point) {
        resumeOptions = point;
        // Copy prior evidence steps to this run
        const evidenceSteps = priorSteps.filter((s) => s.phase === "EVIDENCE");
        for (const s of evidenceSteps) {
          await db.agentStep.create({
            data: {
              jobRunId: jobRun.id,
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
              outputData: s.outputData !== null ? (s.outputData as Prisma.InputJsonValue) : Prisma.JsonNull,
              errorMessage: s.errorMessage,
              metadata: s.metadata !== null ? (s.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
            },
          });
        }
        // Also copy completed agent steps up to resume point
        const completedAgentSteps = priorSteps.filter(
          (s) => s.phase === "AGENT" && s.stepIndex < point.startFromStepIndex,
        );
        for (const s of completedAgentSteps) {
          await db.agentStep.create({
            data: {
              jobRunId: jobRun.id,
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
              outputData: s.outputData !== null ? (s.outputData as Prisma.InputJsonValue) : Prisma.JsonNull,
              errorMessage: s.errorMessage,
              metadata: s.metadata !== null ? (s.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
            },
          });
        }
      }
    }

    // 1. Collect Evidence — always runs regardless of market hours unless resuming.
    // Agents (Evidence Analyst, Researchers, Synthesizer) analyze data; they do not need
    // the market open. Market-session rules only gate order submission, not research.
    let bundle;
    if (resumeOptions && options.resumedFromJobRunId) {
      // Reuse the evidence bundle from the prior run
      const priorRun = await db.jobRun.findUnique({
        where: { id: options.resumedFromJobRunId },
        select: { outputRefs: true },
      });
      const refs = priorRun?.outputRefs as Record<string, string> | null;
      const priorBundleId = refs?.evidenceBundleId;
      if (priorBundleId) {
        const existing = await db.evidenceBundle.findUnique({ where: { id: priorBundleId } });
        if (existing) {
          bundle = existing;
        }
      }
    }
    if (!bundle) {
      bundle = await collectEvidenceForStrategy(strategyId, db, jobRun.id);
    }

    // If required evidence failed, throw error to trigger FAILED/RETRY
    if (bundle.status === "FAILED") {
      throw new Error("Required evidence collection failed.");
    }

    // 2. Run Agent Workflow — always runs regardless of market hours.
    const packet = await runStrategyAgentWorkflow(strategyId, bundle.id, db, jobRun.id, resumeOptions);

    // 3. Risk Check & Execute if outputMode is PROPOSED_ORDERS.
    // P7-S3: Market-session rules are checked here, immediately before order submission,
    // not before the pipeline. Research strategies (RANKED_IDEAS) are never gated.
    let executionResult = "skipped";
    if (strategy.outputMode === "PROPOSED_ORDERS" && packet && packet.proposedOrders.length > 0) {
      const sessionResult = checkMarketSessionRules(strategy.marketSessionRules as MarketSessionRules | null);
      if (!sessionResult.allowed) {
        executionResult = `session_gated: ${sessionResult.reason ?? "outside allowed session"}`;

        await db.auditLog.create({
          data: {
            actorType: "SYSTEM",
            action: "strategy.session_gated",
            target: `strategy_instance:${strategyId}`,
            metadata: { reason: sessionResult.reason, packetId: packet.id },
          },
        });
      } else {
        // Write risk step
        const riskStart = Date.now();
        const riskStepId = await createAgentStep(db, {
          jobRunId: jobRun.id,
          phase: "RISK",
          stepIndex: 0,
          name: "Risk Validation",
          role: "Risk Engine",
        });

        const { packetStatus } = await validateRiskForPacket(packet.id, db);

        await updateAgentStep(db, riskStepId, {
          status: packetStatus === "hard_block" ? "FAILED" : "COMPLETED",
          durationMs: Date.now() - riskStart,
          outputData: { packetStatus },
        });

        if (packetStatus !== "hard_block") {
          // Write execution step
          const execStart = Date.now();
          const execStepId = await createAgentStep(db, {
            jobRunId: jobRun.id,
            phase: "EXECUTION",
            stepIndex: 0,
            name: "Order Execution",
            role: "Execution Engine",
          });

          if (strategy.executionMode === "PAPER") {
            await executePacket(packet.id, db);
            executionResult = "executed";
            await updateAgentStep(db, execStepId, {
              status: "COMPLETED",
              durationMs: Date.now() - execStart,
              outputData: { mode: "PAPER" },
            });
          } else if (strategy.executionMode === "LIVE") {
            if (strategy.liveAcknowledgedAt) {
              await executePacket(packet.id, db);
              executionResult = "executed";
              await updateAgentStep(db, execStepId, {
                status: "COMPLETED",
                durationMs: Date.now() - execStart,
                outputData: { mode: "LIVE" },
              });
            } else {
              executionResult = "live_acknowledgment_missing";
              await updateAgentStep(db, execStepId, {
                status: "SKIPPED",
                durationMs: Date.now() - execStart,
                errorMessage: "Live trading acknowledgment not completed.",
              });
            }
          } else {
            await updateAgentStep(db, execStepId, {
              status: "SKIPPED",
              durationMs: Date.now() - execStart,
            });
          }
        } else {
          executionResult = "risk_blocked";
        }
      }
    } else {
      executionResult = "no_orders_generated_or_ranked_ideas_mode";
    }

    // Compute status from steps
    const allSteps = await db.agentStep.findMany({ where: { jobRunId: jobRun.id } });
    const finalStatus = computeJobRunStatus(allSteps, strategy.outputMode, executionResult);

    // Update job to completed
    await db.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: finalStatus,
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
        outputRefs: {
          evidenceBundleId: bundle.id,
          proposedOrderPacketId: packet?.id || null,
          executionResult,
        } as Prisma.InputJsonValue,
      },
    });

  } catch (err) {
    // Job Failure
    await db.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: "FAILED",
        errorCode: err instanceof Error ? err.name : "UNKNOWN_ERROR",
        errorMessage: err instanceof Error ? err.message : String(err),
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
      },
    });

    await db.auditLog.create({
      data: {
        actorType: "SYSTEM",
        action: "job.failed",
        target: `job_run:${jobRun.id}`,
        metadata: { error: err instanceof Error ? err.message : String(err) },
      },
    });

    throw err;
  }
}
