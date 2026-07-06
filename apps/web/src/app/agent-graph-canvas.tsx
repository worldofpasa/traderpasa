"use client";

import { useCallback, useEffect, useMemo } from "react";
import "@xyflow/react/dist/style.css";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Handle,
  Position,
  addEdge,
  useNodesState,
  useEdgesState,
  type NodeProps,
  type Node,
  type Edge,
  type Connection,
  MarkerType,
  BackgroundVariant,
} from "@xyflow/react";
import type { AgentDefinition, AgentRoleType, AgentTemplate } from "@pasa-trader/schemas";
import { TERMINAL_OUTPUT_TYPES } from "@pasa-trader/schemas";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Credential {
  id: string;
  kind: string;
  provider: string;
  label: string;
}

export interface AgentRunStatus {
  state: "pending" | "running" | "completed" | "failed";
  durationMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  error?: string;
}

interface AgentNodeData {
  agent: AgentDefinition;
  credential: Credential | null;
  status?: AgentRunStatus;
  readOnly?: boolean;
  [key: string]: unknown;
}

// ─── Role config ──────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<AgentRoleType, string> = {
  ANALYST: "Analyst",
  RESEARCHER: "Researcher",
  SYNTHESIZER: "Synthesizer",
  TRADER: "Trader",
  RISK_REVIEWER: "Risk Reviewer",
};

const ROLE_ACCENT: Record<AgentRoleType, string> = {
  ANALYST: "#c47a4a",
  RESEARCHER: "#5b8dd9",
  SYNTHESIZER: "#47a0a0",
  TRADER: "#c49a4a",
  RISK_REVIEWER: "#9b7ec8",
};

// ─── Layout algorithm ─────────────────────────────────────────────────────────

const NODE_W = 220;
const NODE_H = 80;
const X_GAP = 48;
const Y_GAP = 72;

interface ParallelGroup {
  id: string;
  agentIds: string[];
}

function validateTeamGraph(agents: AgentDefinition[]): string | null {
  const enabled = agents.filter((a) => a.enabled);
  if (enabled.length === 0) return "No enabled agents in the graph.";
  const ids = new Set(enabled.map((a) => a.id));
  for (const agent of enabled) {
    for (const dep of agent.handoffFrom) {
      if (!ids.has(dep)) {
        return `Agent "${agent.name}" depends on missing or disabled agent "${dep}".`;
      }
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const hasCycleFrom = (id: string): boolean => {
    if (visited.has(id)) return false;
    if (visiting.has(id)) return true;
    visiting.add(id);
    const agent = enabled.find((a) => a.id === id);
    if (agent) {
      for (const dep of agent.handoffFrom) {
        if (hasCycleFrom(dep)) return true;
      }
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  for (const agent of enabled) {
    if (hasCycleFrom(agent.id)) return "Cycle detected in agent handoff graph.";
  }
  const sinks = enabled.filter((a) => !enabled.some((b) => b.handoffFrom.includes(a.id)));
  if (sinks.length === 0) return "No terminal agent — graph has no sink node.";
  const terminalOk = sinks.some((s) => TERMINAL_OUTPUT_TYPES.includes(s.outputType));
  if (!terminalOk) {
    return `Terminal agent must output one of: ${TERMINAL_OUTPUT_TYPES.join(", ")}.`;
  }
  return null;
}

function computeLayout(
  agents: AgentDefinition[],
  parallelGroups?: ParallelGroup[],
): Map<string, { x: number; y: number }> {
  const enabledIds = new Set(agents.filter((a) => a.enabled).map((a) => a.id));
  const layerOf = new Map<string, number>();

  // Roots: no enabled deps
  for (const agent of agents) {
    const enabledDeps = agent.handoffFrom.filter((id) => enabledIds.has(id));
    if (enabledDeps.length === 0) layerOf.set(agent.id, 0);
  }

  // Iterative longest-path layer assignment
  let changed = true;
  while (changed) {
    changed = false;
    for (const agent of agents) {
      if (layerOf.has(agent.id)) continue;
      const deps = agent.handoffFrom.filter((id) => enabledIds.has(id));
      if (deps.every((id) => layerOf.has(id))) {
        const maxDep = Math.max(...deps.map((id) => layerOf.get(id)!));
        layerOf.set(agent.id, maxDep + 1);
        changed = true;
      }
    }
  }
  // Fallback for cycles or broken refs
  const maxLayer = layerOf.size > 0 ? Math.max(...layerOf.values()) : 0;
  for (const agent of agents) {
    if (!layerOf.has(agent.id)) layerOf.set(agent.id, maxLayer + 1);
  }

  // Group by layer, sort within layer by `order`
  const layers = new Map<number, AgentDefinition[]>();
  for (const agent of agents) {
    const layer = layerOf.get(agent.id) ?? 0;
    if (!layers.has(layer)) layers.set(layer, []);
    layers.get(layer)!.push(agent);
  }
  for (const [, group] of layers) group.sort((a, b) => a.order - b.order);

  const parallelY = new Map<string, number>();
  if (parallelGroups) {
    for (const pg of parallelGroups) {
      const layer = Math.min(
        ...pg.agentIds
          .map((id) => layerOf.get(id))
          .filter((n): n is number => n !== undefined),
      );
      if (Number.isFinite(layer)) {
        for (const id of pg.agentIds) parallelY.set(id, layer);
      }
    }
  }

  const positions = new Map<string, { x: number; y: number }>();
  for (const [layerIdx, group] of layers) {
    const swimlaneIds = new Set(
      parallelGroups?.flatMap((pg) => (parallelY.get(pg.agentIds[0] ?? "") === layerIdx ? pg.agentIds : [])) ?? [],
    );
    const ordered = [...group].sort((a, b) => {
      const aIn = swimlaneIds.has(a.id) ? 0 : 1;
      const bIn = swimlaneIds.has(b.id) ? 0 : 1;
      return aIn - bIn || a.order - b.order;
    });
    const totalW = ordered.length * NODE_W + (ordered.length - 1) * X_GAP;
    const startX = -totalW / 2;
    ordered.forEach((agent, i) => {
      positions.set(agent.id, {
        x: startX + i * (NODE_W + X_GAP),
        y: (parallelY.get(agent.id) ?? layerIdx) * (NODE_H + Y_GAP),
      });
    });
  }
  return positions;
}

// ─── Custom node ──────────────────────────────────────────────────────────────

function AgentNodeComponent({ data, selected }: NodeProps) {
  const { agent, credential, status, readOnly } = data as AgentNodeData;
  const accent = ROLE_ACCENT[agent.role as AgentRoleType];

  const statusClass =
    status?.state === "running" ? "ag-node-dot status-running" :
    status?.state === "completed" ? "ag-node-dot status-completed" :
    status?.state === "failed" ? "ag-node-dot status-failed" :
    null;

  const connectable = !readOnly;

  return (
    <div
      className={`ag-node${selected ? " ag-node-selected" : ""}${!agent.enabled ? " ag-node-disabled" : ""}`}
      style={{ "--ag-role-accent": accent } as React.CSSProperties}
    >
      <Handle
        type="target"
        position={Position.Top}
        className={`ag-handle${readOnly ? " ag-handle-ro" : ""}`}
        isConnectable={connectable}
      />
      <div className="ag-node-inner">
        <div className="ag-node-role-bar" />
        <div className="ag-node-content">
          <div className="ag-node-name-row">
            {statusClass && <span className={statusClass} />}
            <span className="ag-node-name">{agent.name}</span>
          </div>
          <span className="ag-node-role">
            {ROLE_LABELS[agent.role as AgentRoleType]}
            {agent.specialization ? ` · ${agent.specialization}` : ""}
          </span>
          {credential && (
            <span className="ag-node-model">{credential.label}</span>
          )}
          {status?.state === "completed" && (
            <span className="ag-node-stats">
              {((status.promptTokens ?? 0) + (status.completionTokens ?? 0)).toLocaleString()} tok
              {status.durationMs ? ` · ${(status.durationMs / 1000).toFixed(1)}s` : ""}
            </span>
          )}
          {status?.state === "failed" && (
            <span className="ag-node-error">{status.error ?? "Failed"}</span>
          )}
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className={`ag-handle${readOnly ? " ag-handle-ro" : ""}`}
        isConnectable={connectable}
      />
    </div>
  );
}

const NODE_TYPES = { agentNode: AgentNodeComponent };

// ─── Build nodes + edges from agents config ───────────────────────────────────

function buildGraph(
  agents: AgentDefinition[],
  credentials: Credential[],
  positions: Map<string, { x: number; y: number }>,
  statuses: Record<string, AgentRunStatus> | undefined,
  readOnly: boolean,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = agents.map((agent) => ({
    id: agent.id,
    type: "agentNode",
    position: positions.get(agent.id) ?? { x: 0, y: 0 },
    data: {
      agent,
      credential: credentials.find((c) => c.id === agent.credentialId) ?? null,
      status: statuses?.[agent.id],
      readOnly,
    } as AgentNodeData,
  }));

  const enabledIds = new Set(agents.filter((a) => a.enabled).map((a) => a.id));
  const edges: Edge[] = [];
  for (const agent of agents) {
    for (const srcId of agent.handoffFrom) {
      if (!enabledIds.has(srcId)) continue;
      edges.push({
        id: `${srcId}->${agent.id}`,
        source: srcId,
        target: agent.id,
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed, color: "var(--accent)" },
        style: { stroke: "var(--accent)", strokeWidth: 1.5 },
      });
    }
  }
  return { nodes, edges };
}

// ─── Inner flow component (inside ReactFlowProvider) ──────────────────────────

interface FlowProps {
  agents: AgentDefinition[];
  credentials: Credential[];
  readOnly?: boolean;
  selectedAgentId?: string | null;
  onAgentSelect?: (id: string | null) => void;
  onAgentsChange?: (agents: AgentDefinition[]) => void;
  statuses?: Record<string, AgentRunStatus>;
  parallelGroups?: ParallelGroup[];
  catalogTemplates?: AgentTemplate[];
  onAddFromCatalog?: (template: AgentTemplate) => void;
}

function AgentGraphFlow({
  agents,
  credentials,
  readOnly = true,
  selectedAgentId,
  onAgentSelect,
  onAgentsChange,
  statuses,
  parallelGroups,
  catalogTemplates,
  onAddFromCatalog,
}: FlowProps) {
  const graphError = useMemo(() => validateTeamGraph(agents), [agents]);
  const positions = useMemo(() => computeLayout(agents, parallelGroups), [agents, parallelGroups]);

  const { nodes: initNodes, edges: initEdges } = useMemo(
    () => buildGraph(agents, credentials, positions, statuses, readOnly ?? true),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges);

  // Sync when agents / statuses / selection change
  useEffect(() => {
    const pos = computeLayout(agents, parallelGroups);
    const { nodes: n, edges: e } = buildGraph(agents, credentials, pos, statuses, readOnly ?? true);
    // Preserve existing drag positions in interactive mode
    if (!readOnly) {
      setNodes((prev) =>
        n.map((node) => {
          const existing = prev.find((p) => p.id === node.id);
          return existing ? { ...node, position: existing.position } : node;
        }),
      );
    } else {
      setNodes(n);
    }
    setEdges(e);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents, credentials, statuses, readOnly]);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (readOnly || !onAgentsChange) return;
      const { source, target } = connection;
      if (!source || !target) return;
      const updated = agents.map((a) => {
        if (a.id !== target) return a;
        if (a.handoffFrom.includes(source)) return a;
        return { ...a, handoffFrom: [...a.handoffFrom, source] };
      });
      onAgentsChange(updated);
      setEdges((eds) => addEdge(connection, eds));
    },
    [agents, onAgentsChange, readOnly, setEdges],
  );

  const handleEdgesDelete = useCallback(
    (deletedEdges: Edge[]) => {
      if (readOnly || !onAgentsChange) return;
      const toRemove = new Map<string, string[]>();
      for (const edge of deletedEdges) {
        if (!toRemove.has(edge.target)) toRemove.set(edge.target, []);
        toRemove.get(edge.target)!.push(edge.source);
      }
      const updated = agents.map((a) => {
        const remove = toRemove.get(a.id);
        if (!remove) return a;
        return { ...a, handoffFrom: a.handoffFrom.filter((id) => !remove.includes(id)) };
      });
      onAgentsChange(updated);
    },
    [agents, onAgentsChange, readOnly],
  );

  const onNodeClick = useCallback(
    (_evt: React.MouseEvent, node: Node) => {
      if (!onAgentSelect) return;
      onAgentSelect(node.id === selectedAgentId ? null : node.id);
    },
    [onAgentSelect, selectedAgentId],
  );

  return (
    <>
      {!readOnly && catalogTemplates && catalogTemplates.length > 0 && onAddFromCatalog && (
        <div className="ag-catalog-palette">
          {catalogTemplates.slice(0, 24).map((t) => (
            <button
              key={t.id}
              type="button"
              className="ag-catalog-chip"
              onClick={() => onAddFromCatalog(t)}
              title={t.description}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
      {graphError && <p className="ag-graph-validation">⚠ {graphError}</p>}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        {...(!readOnly ? { onNodesChange, onEdgesChange, onConnect, onEdgesDelete: handleEdgesDelete } : {})}
        {...(onAgentSelect ? { onNodeClick } : {})}
        nodeTypes={NODE_TYPES}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable={!readOnly}
        deleteKeyCode={readOnly ? null : "Backspace"}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        colorMode="dark"
        minZoom={0.3}
        maxZoom={2.5}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--line)" />
      </ReactFlow>
    </>
  );
}

// ─── Exported component ───────────────────────────────────────────────────────

interface AgentGraphCanvasProps extends FlowProps {
  className?: string;
}

export function AgentGraphCanvas({ className, ...props }: AgentGraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <div className={`ag-canvas${className ? ` ${className}` : ""}`}>
        <AgentGraphFlow {...props} />
      </div>
    </ReactFlowProvider>
  );
}
