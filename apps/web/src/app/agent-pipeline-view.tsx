"use client";

import type { AgentRoleType, AgentTeamConfig } from "@pasa-trader/schemas";
import { AgentGraphCanvas, type AgentRunStatus, type Credential } from "./agent-graph-canvas";

export type { AgentRunStatus };

interface Props {
  teamConfig: Record<string, unknown> | null | undefined;
  credentials: Credential[];
  statuses?: Record<string, AgentRunStatus>;
  onAgentClick?: (agentId: string) => void;
  canvasClassName?: string;
}

const DEFAULT_AGENTS: AgentTeamConfig["agents"] = [
  {
    id: "legacy-evidence-summarizer",
    name: "Evidence Summarizer",
    role: "ANALYST" as AgentRoleType,
    systemPrompt: "",
    userPromptTemplate: "",
    outputType: "EVIDENCE_ANALYSIS",
    handoffFrom: [],
    order: 1,
    enabled: true,
  },
  {
    id: "legacy-order-generation",
    name: "Order Generation",
    role: "TRADER" as AgentRoleType,
    systemPrompt: "",
    userPromptTemplate: "",
    outputType: "PROPOSED_ORDERS",
    handoffFrom: ["legacy-evidence-summarizer"],
    order: 2,
    enabled: true,
  },
];

function parseAgents(teamConfig: Props["teamConfig"]): AgentTeamConfig["agents"] {
  if (!teamConfig || Object.keys(teamConfig).length === 0) return DEFAULT_AGENTS;
  const maybeConfig = teamConfig as { version?: unknown; agents?: unknown };
  if (maybeConfig.version !== 1 || !Array.isArray(maybeConfig.agents)) return DEFAULT_AGENTS;
  const agents = maybeConfig.agents as AgentTeamConfig["agents"];
  return [...agents].sort((a, b) => a.order - b.order);
}

export function AgentPipelineView({ teamConfig, credentials, statuses, onAgentClick, canvasClassName }: Props) {
  const agents = parseAgents(teamConfig);
  const isDefault = !teamConfig || Object.keys(teamConfig).length === 0;
  const headerText = isDefault ? "2-step default pipeline" : `${String(agents.length)}-agent pipeline`;

  return (
    <div className="agent-pipeline">
      <div className="agent-pipeline-header">
        <span>{headerText}</span>
      </div>
      <AgentGraphCanvas
        agents={agents}
        credentials={credentials}
        readOnly
        {...(canvasClassName ? { className: canvasClassName } : {})}
        {...(statuses ? { statuses } : {})}
        {...(onAgentClick ? { onAgentSelect: (id) => { if (id) onAgentClick(id); } } : {})}
      />
    </div>
  );
}
