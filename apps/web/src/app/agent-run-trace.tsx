"use client";

interface AgentRunRecord {
  agentId: string;
  agentName: string;
  role: string;
  outputType: string;
  output: unknown;
  credentialProvider: string;
  durationMs: number;
  promptTokens: number;
  completionTokens: number;
  repaired: boolean;
  error?: string;
}

interface Props {
  metadata: unknown;
}

function parseAgentRuns(metadata: unknown): AgentRunRecord[] {
  if (!metadata || typeof metadata !== "object") return [];
  const maybeRuns = (metadata as { agentRuns?: unknown }).agentRuns;
  if (!Array.isArray(maybeRuns)) return [];
  return maybeRuns.filter((run): run is AgentRunRecord =>
    Boolean(run) &&
    typeof run === "object" &&
    typeof (run as AgentRunRecord).agentId === "string" &&
    typeof (run as AgentRunRecord).agentName === "string",
  );
}

function previewOutput(output: unknown) {
  if (output === null || output === undefined) return "No output recorded.";
  const text = typeof output === "string" ? output : JSON.stringify(output);
  if (!text) return "No output recorded.";
  return text.length > 200 ? `${text.slice(0, 200)}...` : text;
}

export function AgentRunTrace({ metadata }: Props) {
  const runs = parseAgentRuns(metadata);
  if (runs.length === 0) return null;

  return (
    <section className="agent-run-trace">
      <div className="agent-run-trace-header">
        <h3>Agent Run Trace</h3>
        <span>{runs.length} step{runs.length === 1 ? "" : "s"}</span>
      </div>
      <div className="agent-run-list">
        {runs.map((run, index) => (
          <details key={`${run.agentId}-${String(index)}`} className={`agent-run-row ${run.error ? "has-error" : ""}`}>
            <summary>
              <span className="agent-run-index">{index + 1}</span>
              <span className="agent-run-main">
                <strong>{run.agentName}</strong>
                <small>{run.role} · {run.outputType} · {run.credentialProvider}</small>
              </span>
              <span className="agent-run-metrics">
                {run.repaired && <span className="badge badge-warning">repaired</span>}
                {run.error && <span className="badge badge-error">failed</span>}
                <span>{run.durationMs}ms</span>
                <span>{run.promptTokens + run.completionTokens} tokens</span>
              </span>
            </summary>
            {run.error ? (
              <p className="agent-run-error">{run.error}</p>
            ) : (
              <p className="agent-run-preview">{previewOutput(run.output)}</p>
            )}
            <pre className="agent-run-json">{JSON.stringify(run.output, null, 2)}</pre>
          </details>
        ))}
      </div>
    </section>
  );
}
