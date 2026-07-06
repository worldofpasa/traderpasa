"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, RefreshCw, RotateCcw } from "lucide-react";

type StepStatus = "RUNNING" | "COMPLETED" | "PARTIAL" | "FAILED" | "SKIPPED";
type RunStatus =
  | "RUNNING"
  | "COMPLETED"
  | "PARTIAL"
  | "NEEDS_ACTION"
  | "SKIPPED"
  | "FAILED"
  | "RETRYING";
type Phase = "EVIDENCE" | "AGENT" | "RISK" | "EXECUTION";

interface AgentStepData {
  id: string;
  phase: Phase;
  stepIndex: number;
  name: string;
  role: string | null;
  agentId: string | null;
  status: StepStatus;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  outputData: unknown;
  errorMessage: string | null;
  metadata: unknown;
}

interface RunData {
  id: string;
  jobType: string;
  status: RunStatus;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  createdAt: string;
  resumedFromJobRunId: string | null;
  outputRefs: Record<string, unknown> | null;
}

interface StrategyData {
  id: string;
  name: string;
  outputMode: string;
  executionMode: string;
}

interface PacketData {
  id: string;
  status: string;
  rationale: string;
  uncertaintyNote: string | null;
  createdAt: string;
  orderCount: number;
}

interface TokenStats {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  estimatedCostUsd: number | null;
}

interface RunDetailResponse {
  run: RunData;
  strategy: StrategyData | null;
  steps: AgentStepData[];
  packet: PacketData | null;
  tokenStats: TokenStats;
  resumeAvailable: boolean;
  resumeFromStepIndex: number | null;
  legacyTrace: unknown;
}

const STATUS_LABEL: Record<RunStatus, string> = {
  RUNNING: "Running",
  COMPLETED: "Completed",
  PARTIAL: "Partial",
  NEEDS_ACTION: "Needs Action",
  SKIPPED: "Skipped",
  FAILED: "Failed",
  RETRYING: "Retrying",
};

const PHASE_LABEL: Record<Phase, string> = {
  EVIDENCE: "Evidence Collection",
  AGENT: "Agent Pipeline",
  RISK: "Risk Validation",
  EXECUTION: "Execution",
};

function fmtDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtTokens(n: number | null): string {
  if (!n) return "";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k tok`;
  return `${n} tok`;
}

function fmtTs(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function phaseStatus(steps: AgentStepData[]): StepStatus {
  if (steps.length === 0) return "SKIPPED";
  if (steps.some((s) => s.status === "RUNNING")) return "RUNNING";
  if (steps.some((s) => s.status === "FAILED")) return "FAILED";
  if (steps.every((s) => s.status === "COMPLETED")) return "COMPLETED";
  if (steps.some((s) => s.status === "PARTIAL")) return "PARTIAL";
  if (steps.every((s) => s.status === "SKIPPED")) return "SKIPPED";
  return "PARTIAL";
}

function phaseDurationMs(steps: AgentStepData[]): number | null {
  const durations = steps.map((s) => s.durationMs).filter((d): d is number => d !== null);
  if (durations.length === 0) return null;
  return durations.reduce((a, b) => a + b, 0);
}

function runHref(runId: string, strategyId?: string): string {
  if (strategyId) {
    return `/strategies/${strategyId}?tab=runs&run=${runId}`;
  }
  return `/runs/${runId}`;
}

function StepRow({ step }: { step: AgentStepData }) {
  const [expanded, setExpanded] = useState(false);
  const hasBody = step.outputData !== null || step.errorMessage;
  const totalTokens = (step.promptTokens ?? 0) + (step.completionTokens ?? 0);

  return (
    <li
      className={`rd-step${expanded ? " expanded" : ""}`}
      onClick={() => hasBody && setExpanded((v) => !v)}
      style={{ cursor: hasBody ? "pointer" : "default" }}
    >
      <div className="rd-step-row">
        <div className={`rd-step-dot ${step.status.toLowerCase()}`} />
        <span className={`rd-step-name${step.status === "SKIPPED" ? " skipped" : ""}`}>{step.name}</span>
        {step.role && <span className="rd-step-role">{step.role}</span>}
        {totalTokens > 0 && <span className="rd-step-tokens">{fmtTokens(totalTokens)}</span>}
        <span className="rd-step-duration">{fmtDuration(step.durationMs)}</span>
        {hasBody && (
          expanded
            ? <ChevronDown size={12} style={{ color: "var(--faint)", flexShrink: 0 }} />
            : <ChevronRight size={12} style={{ color: "var(--faint)", flexShrink: 0 }} />
        )}
      </div>
      {expanded && hasBody && (
        <div className="rd-step-body">
          {step.errorMessage && (
            <>
              <div className="rd-step-body-label">Error</div>
              <div className="rd-step-error">{step.errorMessage}</div>
            </>
          )}
          {step.outputData !== null && (
            <>
              <div
                className="rd-step-body-label"
                style={{ marginTop: step.errorMessage ? "var(--space-3)" : 0 }}
              >
                Output
              </div>
              <pre>{JSON.stringify(step.outputData, null, 2)}</pre>
            </>
          )}
        </div>
      )}
    </li>
  );
}

function PhaseSection({ phase, steps }: { phase: Phase; steps: AgentStepData[] }) {
  const status = phaseStatus(steps);
  const duration = phaseDurationMs(steps);

  return (
    <div className="rd-phase-section">
      <div className="rd-phase-header">
        <div className={`rd-phase-dot ${status === "SKIPPED" && steps.length === 0 ? "empty" : status.toLowerCase()}`} />
        <span className="rd-phase-name">{PHASE_LABEL[phase]}</span>
        {duration !== null && <span className="rd-phase-duration">{fmtDuration(duration)}</span>}
      </div>
      {steps.length === 0 ? (
        <div className="rd-phase-empty">No steps recorded</div>
      ) : (
        <ul className="rd-step-list">
          {steps.map((s) => (
            <StepRow key={s.id} step={s} />
          ))}
        </ul>
      )}
    </div>
  );
}

export interface RunDetailViewProps {
  runId: string;
  strategyId?: string;
  compact?: boolean;
  onRetrySuccess?: () => void;
}

export function RunDetailView({ runId, strategyId, compact = false, onRetrySuccess }: RunDetailViewProps) {
  const [data, setData] = useState<RunDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/runs/${runId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? "Failed to load run.");
      }
      setData(await res.json() as RunDetailResponse);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    if (!data) return;
    if (data.run.status !== "RUNNING" && data.run.status !== "RETRYING") return;
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [data, load]);

  async function handleRetry() {
    if (!data) return;
    setRetrying(true);
    try {
      const csrfRes = await fetch("/api/auth/csrf-token");
      const { csrfToken } = await csrfRes.json() as { csrfToken: string };
      const res = await fetch(`/api/runs/${runId}/retry`, {
        method: "POST",
        headers: { "x-csrf-token": csrfToken, "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? "Retry failed.");
      }
      onRetrySuccess?.();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Retry failed.");
    } finally {
      setRetrying(false);
    }
  }

  if (loading) {
    return (
      <div className={compact ? "run-detail-embedded-loading" : "rd-loading"} data-testid="run-detail-loading">
        Loading run…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rd-error-banner" data-testid="run-detail-error">
        {error ?? "Run not found."}
      </div>
    );
  }

  const { run, strategy, steps, packet, tokenStats, resumeAvailable, legacyTrace } = data;
  const phaseMap: Record<Phase, AgentStepData[]> = {
    EVIDENCE: [],
    AGENT: [],
    RISK: [],
    EXECUTION: [],
  };
  for (const s of steps) {
    phaseMap[s.phase].push(s);
  }

  const runStatusClass = run.status.toLowerCase().replace("_", "_");
  const executionResult = run.outputRefs?.executionResult as string | undefined;
  const contextStrategyId = strategyId ?? strategy?.id;

  return (
    <div className={compact ? "run-detail-embedded" : "run-detail-full"} data-testid="run-detail-view">
      {!compact && (
        <div className="rd-header">
          <div className="rd-title-group">
            {strategy && <div className="rd-strategy-name">{strategy.name}</div>}
            <h1 style={{ fontSize: "1.1rem", fontWeight: 600, margin: 0 }}>Run Detail</h1>
            <div className="rd-run-id">{run.id}</div>
          </div>
          <div className={`rd-status-badge ${runStatusClass}`}>{STATUS_LABEL[run.status]}</div>
        </div>
      )}

      {compact && (
        <div className="run-detail-embedded-header">
          <div className="rd-run-id font-mono">{run.id}</div>
          <div className={`rd-status-badge ${runStatusClass}`}>{STATUS_LABEL[run.status]}</div>
        </div>
      )}

      <div className="rd-meta-row">
        <div className="rd-meta-item">
          <span className="rd-meta-label">Started</span>
          <span className="rd-meta-value">{fmtTs(run.startedAt)}</span>
        </div>
        {run.finishedAt && (
          <div className="rd-meta-item">
            <span className="rd-meta-label">Finished</span>
            <span className="rd-meta-value">{fmtTs(run.finishedAt)}</span>
          </div>
        )}
        <div className="rd-meta-item">
          <span className="rd-meta-label">Duration</span>
          <span className="rd-meta-value">{fmtDuration(run.durationMs)}</span>
        </div>
        {strategy && (
          <>
            <div className="rd-meta-item">
              <span className="rd-meta-label">Output Mode</span>
              <span className="rd-meta-value">{strategy.outputMode}</span>
            </div>
            <div className="rd-meta-item">
              <span className="rd-meta-label">Execution Mode</span>
              <span className="rd-meta-value">{strategy.executionMode}</span>
            </div>
          </>
        )}
        {executionResult && (
          <div className="rd-meta-item">
            <span className="rd-meta-label">Result</span>
            <span
              className="rd-meta-value"
              style={{ maxWidth: "18rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {executionResult}
            </span>
          </div>
        )}
        {run.resumedFromJobRunId && (
          <div className="rd-meta-item">
            <span className="rd-meta-label">Resumed From</span>
            <Link
              href={runHref(run.resumedFromJobRunId, contextStrategyId)}
              style={{ fontSize: "0.7rem", fontFamily: "var(--font-mono)", color: "var(--accent)" }}
            >
              {run.resumedFromJobRunId.slice(0, 12)}…
            </Link>
          </div>
        )}
      </div>

      {run.errorMessage && (
        <div className="rd-error-banner">
          {run.errorCode && <div className="rd-error-code">{run.errorCode}</div>}
          {run.errorMessage}
        </div>
      )}

      {(["EVIDENCE", "AGENT", "RISK", "EXECUTION"] as Phase[]).map((phase) => (
        <PhaseSection key={phase} phase={phase} steps={phaseMap[phase]} />
      ))}

      {legacyTrace !== null && legacyTrace !== undefined && (
        <div className="rd-legacy-trace">
          <div className="rd-legacy-trace-label">Agent Run Trace (Legacy)</div>
          <pre>{JSON.stringify(legacyTrace, null, 2)}</pre>
        </div>
      )}

      <div className="rd-footer">
        <div className="rd-footer-stats">
          {tokenStats.totalPromptTokens > 0 && (
            <div className="rd-meta-item">
              <span className="rd-meta-label">Total Tokens</span>
              <span className="rd-meta-value">
                {(tokenStats.totalPromptTokens + tokenStats.totalCompletionTokens).toLocaleString()}
              </span>
            </div>
          )}
          {tokenStats.estimatedCostUsd !== null && (
            <div className="rd-meta-item">
              <span className="rd-meta-label">Est. Cost</span>
              <span className="rd-meta-value">${tokenStats.estimatedCostUsd.toFixed(4)}</span>
            </div>
          )}
          {packet && (
            <div className="rd-meta-item">
              <span className="rd-meta-label">Packet</span>
              <span className="rd-meta-value">
                {packet.status} · {packet.orderCount} order{packet.orderCount !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>
        <div className="rd-footer-actions">
          <button className="btn-ghost" onClick={() => void load()} title="Refresh" type="button">
            <RefreshCw size={14} />
          </button>
          {(run.status === "FAILED" || run.status === "PARTIAL") && (
            <button className="btn-primary" onClick={() => void handleRetry()} disabled={retrying} type="button">
              <RotateCcw size={14} />
              {retrying ? "Retrying…" : resumeAvailable ? "Resume from Failure" : "Re-run"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
