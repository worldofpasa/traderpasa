"use client";

import { ChevronDown, RefreshCw } from "lucide-react";
import { RunDetailView } from "../components/run-detail-view";
import type { JobRun } from "../lib/strategy-types";

function runBadgeClass(status: string) {
  if (status === "COMPLETED") return "badge-success";
  if (status === "RUNNING" || status === "RETRYING") return "badge-warning";
  if (status === "FAILED") return "badge-error";
  return "badge-paper";
}

function fmtDuration(ms: number | null) {
  if (ms === null) return null;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

interface StrategyRunsListProps {
  runs: JobRun[];
  strategyId: string;
  loading?: boolean;
  selectedRunId?: string | null;
  onSelectRun?: (runId: string | null) => void;
  onRefresh?: () => void;
}

export function StrategyRunsList({
  runs,
  strategyId,
  loading,
  selectedRunId,
  onSelectRun,
  onRefresh,
}: StrategyRunsListProps) {
  if (loading) {
    return <p className="strategy-page-muted">Loading runs…</p>;
  }

  if (runs.length === 0) {
    return (
      <div className="strategy-runs-empty-panel">
        <p>No runs yet for this strategy.</p>
        <p className="strategy-page-muted">Trigger a run from the header actions to enqueue evidence collection and agent execution.</p>
      </div>
    );
  }

  return (
    <div className="strategy-runs-panel">
      <div className="strategy-runs-panel-toolbar">
        <span className="strategy-page-muted">{runs.length} run{runs.length === 1 ? "" : "s"}</span>
        {onRefresh ? (
          <button type="button" className="button button-secondary button-sm" onClick={onRefresh}>
            <RefreshCw size={14} /> Refresh
          </button>
        ) : null}
      </div>

      <div className="strategy-runs-table">
        {runs.map((run) => {
          const expanded = selectedRunId === run.id;
          return (
            <div
              key={run.id}
              className={`strategy-run-accordion${expanded ? " is-expanded" : ""}`}
              data-testid={`strategy-run-accordion-${run.id}`}
            >
              <button
                type="button"
                className="strategy-run-row"
                aria-expanded={expanded}
                data-testid={`strategy-run-toggle-${run.id}`}
                onClick={() => onSelectRun?.(expanded ? null : run.id)}
              >
                <span className={`run-status-dot run-status-${run.status.toLowerCase()}`} />
                <span className="run-row-time font-mono">
                  {new Date(run.createdAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
                <span className={`badge badge-sm ${runBadgeClass(run.status)}`}>{run.status}</span>
                <span className="run-row-job font-mono">{run.jobType}</span>
                {run.durationMs != null && (
                  <span className="run-row-duration font-mono">{fmtDuration(run.durationMs)}</span>
                )}
                {run.errorCode && <span className="run-row-error font-mono">{run.errorCode}</span>}
                <ChevronDown size={14} className="strategy-run-chevron" />
              </button>

              {expanded && (
                <div className="strategy-run-accordion-body" data-testid={`strategy-run-detail-${run.id}`}>
                  <RunDetailView
                    runId={run.id}
                    strategyId={strategyId}
                    compact
                    onRetrySuccess={() => {
                      onSelectRun?.(null);
                      onRefresh?.();
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
