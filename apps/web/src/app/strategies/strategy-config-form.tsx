"use client";

import { AgentTeamBuilder, type AgentTeamConfig } from "../agent-team-builder";
import { getStrategyCron } from "../lib/strategy-utils";
import type { BrokerAccount, Credential, StrategyInstance } from "../lib/strategy-types";

interface StrategyConfigFormProps {
  strategy: StrategyInstance;
  credentials: Credential[];
  brokerAccounts: BrokerAccount[];
  initialExpandedAgentId?: string | null;
  onChange: (strategy: StrategyInstance) => void;
  addToast: (message: string, type?: "success" | "error" | "info" | "warning") => void;
  showConfirm: (
    message: string,
    onConfirm: () => void,
    options?: { title?: string; danger?: boolean; confirmLabel?: string },
  ) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function StrategyConfigForm({
  strategy,
  credentials,
  brokerAccounts,
  initialExpandedAgentId,
  onChange,
  addToast,
  showConfirm,
  onSubmit,
}: StrategyConfigFormProps) {
  return (
    <form id="strategy-edit-form" className="setup-form strategy-settings-form" onSubmit={onSubmit}>
      <label>
        Strategy Name
        <input
          type="text"
          value={strategy.name}
          onChange={(e) => onChange({ ...strategy, name: e.target.value })}
          required
        />
      </label>

      <label>
        Description
        <input
          type="text"
          value={strategy.description || ""}
          onChange={(e) => onChange({ ...strategy, description: e.target.value })}
        />
      </label>

      <div className="form-row">
        <label>
          Broker Account Target
          <select
            value={strategy.brokerAccountId || ""}
            onChange={(e) => onChange({ ...strategy, brokerAccountId: e.target.value || null })}
          >
            <option value="">-- Select Linked Account --</option>
            {brokerAccounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.label} ({acc.environment})
              </option>
            ))}
          </select>
        </label>

        <label>
          Execution Mode
          <select
            value={strategy.executionMode}
            onChange={(e) => onChange({ ...strategy, executionMode: e.target.value as StrategyInstance["executionMode"] })}
          >
            <option value="PAPER">PAPER (Simulation)</option>
            <option value="LIVE">LIVE (Real Funds)</option>
          </select>
        </label>
      </div>

      <label>
        Watchlist Symbols (comma-separated)
        <input
          type="text"
          value={strategy.symbols.join(", ")}
          onChange={(e) =>
            onChange({
              ...strategy,
              symbols: e.target.value
                .split(",")
                .map((s) => s.trim().toUpperCase())
                .filter(Boolean),
            })
          }
        />
      </label>

      <div className="form-row">
        <label>
          Output Mode
          <select
            value={strategy.outputMode}
            onChange={(e) => onChange({ ...strategy, outputMode: e.target.value as StrategyInstance["outputMode"] })}
          >
            <option value="PROPOSED_ORDERS">PROPOSED ORDERS (Auto or Manual)</option>
            <option value="RANKED_IDEAS">RANKED IDEAS (Research Mode Only)</option>
          </select>
        </label>

        <label>
          Model Logging Depth
          <select
            value={strategy.modelLoggingDepth}
            onChange={(e) =>
              onChange({ ...strategy, modelLoggingDepth: e.target.value as StrategyInstance["modelLoggingDepth"] })
            }
          >
            <option value="METADATA">METADATA Only</option>
            <option value="FULL">FULL Prompt/Response logs (Opt-in)</option>
          </select>
        </label>
      </div>

      <h3>Per-Step Model Assignment</h3>
      <p className="model-config-help">
        Assign a specific model credential to each agent step. Leave blank to use the default credential.
      </p>
      <div className="form-row">
        <label>
          Summarizer model
          <select
            value={strategy.stepModelConfig?.summarizer ?? ""}
            onChange={(e) => {
              const cfg = { ...strategy.stepModelConfig };
              if (e.target.value) cfg.summarizer = e.target.value;
              else delete cfg.summarizer;
              onChange({ ...strategy, stepModelConfig: cfg });
            }}
          >
            <option value="">(Use default - first MODEL_PROVIDER credential)</option>
            {credentials.filter((c) => c.kind === "MODEL_PROVIDER").map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} ({c.provider})
              </option>
            ))}
          </select>
        </label>
        <label>
          Order generation model
          <select
            value={strategy.stepModelConfig?.orderGeneration ?? ""}
            onChange={(e) => {
              const cfg = { ...strategy.stepModelConfig };
              if (e.target.value) cfg.orderGeneration = e.target.value;
              else delete cfg.orderGeneration;
              onChange({ ...strategy, stepModelConfig: cfg });
            }}
          >
            <option value="">(Use default - first MODEL_PROVIDER credential)</option>
            {credentials.filter((c) => c.kind === "MODEL_PROVIDER").map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} ({c.provider})
              </option>
            ))}
          </select>
        </label>
      </div>

      <h3>Agent Team</h3>
      <p className="model-config-help">
        Define a named team of agents with fixed roles, prompts, and model assignments.
      </p>
      <AgentTeamBuilder
        value={
          strategy.agentTeamConfig && Object.keys(strategy.agentTeamConfig).length > 0
            ? (strategy.agentTeamConfig as unknown as AgentTeamConfig)
            : null
        }
        onChange={(config) =>
          onChange({
            ...strategy,
            agentTeamConfig: config ? (config as unknown as Record<string, unknown>) : {},
          })
        }
        credentials={credentials}
        initialExpandedAgentId={initialExpandedAgentId ?? null}
        addToast={addToast}
        showConfirm={showConfirm}
      />

      <h3>Risk Management Parameters</h3>
      <div className="form-row">
        <label>
          Max Position Size (% of Portfolio)
          <input
            type="number"
            value={(strategy.riskConfig?.maxPositionPct as number | undefined) ?? ""}
            onChange={(e) =>
              onChange({
                ...strategy,
                riskConfig: {
                  ...strategy.riskConfig,
                  maxPositionPct: e.target.value ? Number(e.target.value) : undefined,
                },
              })
            }
          />
        </label>
        <label>
          Restricted Tickers (comma-separated)
          <input
            type="text"
            value={((strategy.riskConfig?.restrictedTickers as string[] | undefined) ?? []).join(", ")}
            onChange={(e) =>
              onChange({
                ...strategy,
                riskConfig: {
                  ...strategy.riskConfig,
                  restrictedTickers: e.target.value
                    .split(",")
                    .map((s) => s.trim().toUpperCase())
                    .filter(Boolean),
                },
              })
            }
          />
        </label>
      </div>

      <h3>Trailing Stop Config</h3>
      <label>
        Trailing Stop Percent
        <input
          type="number"
          value={(strategy.trailingStopConfig?.trailPercent as number | undefined) ?? ""}
          placeholder="e.g. 5 for 5%"
          onChange={(e) =>
            onChange({
              ...strategy,
              trailingStopConfig: e.target.value ? { trailPercent: Number(e.target.value) } : null,
            })
          }
        />
      </label>

      <h3>Job Scheduling</h3>
      <label>
        Cron Schedule Expression
        <input
          type="text"
          value={getStrategyCron(strategy.scheduleConfig, "")}
          placeholder="e.g. */30 * * * *"
          onChange={(e) =>
            onChange({
              ...strategy,
              scheduleConfig: e.target.value ? { cron: e.target.value } : null,
            })
          }
        />
      </label>
    </form>
  );
}
