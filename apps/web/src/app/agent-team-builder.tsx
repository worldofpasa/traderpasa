"use client";

/* eslint-disable complexity */

import { useCallback, useEffect, useState } from "react";
import type {
  AgentCategory,
  AgentDefinition,
  AgentOutputType,
  AgentRoleType,
  AgentTeamConfig,
  AgentTemplate,
} from "@pasa-trader/schemas";
import { ROLE_DEFAULTS, buildTradingDeskTeamConfig } from "@pasa-trader/agents";
import { AgentGraphCanvas } from "./agent-graph-canvas";

export type { AgentTeamConfig };

interface Credential {
  id: string;
  kind: string;
  provider: string;
  label: string;
}

interface Props {
  value: AgentTeamConfig | null;
  onChange: (config: AgentTeamConfig | null) => void;
  credentials: Credential[];
  initialExpandedAgentId?: string | null;
  addToast?: (message: string, type?: "success" | "error" | "info" | "warning") => void;
  showConfirm?: (
    message: string,
    onConfirm: () => void,
    options?: { title?: string; danger?: boolean }
  ) => void;
}

// ─── Role defaults ────────────────────────────────────────────────────────────

const ROLE_OUTPUT_TYPES: Record<AgentRoleType, AgentOutputType> = {
  ANALYST: "EVIDENCE_ANALYSIS",
  RESEARCHER: "DEBATE_THESIS",
  SYNTHESIZER: "SYNTHESIS",
  TRADER: "PROPOSED_ORDERS",
  RISK_REVIEWER: "RISK_REVIEW",
};

const ROLE_SYSTEM_PROMPTS: Record<AgentRoleType, string> = Object.fromEntries(
  (Object.keys(ROLE_DEFAULTS) as AgentRoleType[]).map((role) => [role, ROLE_DEFAULTS[role].systemPrompt]),
) as Record<AgentRoleType, string>;

const ROLE_USER_TEMPLATES: Record<AgentRoleType, string> = Object.fromEntries(
  (Object.keys(ROLE_DEFAULTS) as AgentRoleType[]).map((role) => [role, ROLE_DEFAULTS[role].userPromptTemplate]),
) as Record<AgentRoleType, string>;

// ─── Team presets ─────────────────────────────────────────────────────────────

const PRESETS: Record<string, AgentDefinition[]> = {
  "2-step": [
    {
      id: "evidence-summarizer", name: "Evidence Summarizer", role: "ANALYST",
      systemPrompt: ROLE_SYSTEM_PROMPTS.ANALYST,
      userPromptTemplate: ROLE_USER_TEMPLATES.ANALYST,
      outputType: "EVIDENCE_ANALYSIS", handoffFrom: [], order: 1, enabled: true,
    },
    {
      id: "order-generation", name: "Order Generation", role: "TRADER",
      systemPrompt: ROLE_SYSTEM_PROMPTS.TRADER,
      userPromptTemplate: `Research claims:\n{{evidence-summarizer.claims}}\n\nEvidence refs:\n{{evidence-summarizer.evidenceRefs}}\n\nFreshness warnings:\n{{evidence-summarizer.freshnessWarnings}}\n\nWatchlist: {{symbols}}\nOutput mode: {{outputMode}}`,
      outputType: "PROPOSED_ORDERS", handoffFrom: ["evidence-summarizer"], order: 2, enabled: true,
    },
  ],
  "bull-bear": [
    {
      id: "analyst", name: "Evidence Analyst", role: "ANALYST",
      systemPrompt: ROLE_SYSTEM_PROMPTS.ANALYST,
      userPromptTemplate: ROLE_USER_TEMPLATES.ANALYST,
      outputType: "EVIDENCE_ANALYSIS", handoffFrom: [], order: 1, enabled: true,
    },
    {
      id: "bull-researcher", name: "Bullish Researcher", role: "RESEARCHER",
      systemPrompt: ROLE_SYSTEM_PROMPTS.RESEARCHER.replace("{{side}}", "BULL"),
      userPromptTemplate: `Build the BULL thesis from analyst output.\n\nAnalyst output:\n{{analyst.claims}}\n\nSymbols: {{symbols}}`,
      outputType: "DEBATE_THESIS", handoffFrom: ["analyst"], order: 2, enabled: true,
    },
    {
      id: "bear-researcher", name: "Bearish Researcher", role: "RESEARCHER",
      systemPrompt: ROLE_SYSTEM_PROMPTS.RESEARCHER.replace("{{side}}", "BEAR"),
      userPromptTemplate: `Build the BEAR thesis from analyst output.\n\nAnalyst output:\n{{analyst.claims}}\n\nSymbols: {{symbols}}`,
      outputType: "DEBATE_THESIS", handoffFrom: ["analyst"], order: 3, enabled: true,
    },
    {
      id: "synthesizer", name: "Research Manager", role: "SYNTHESIZER",
      systemPrompt: ROLE_SYSTEM_PROMPTS.SYNTHESIZER,
      userPromptTemplate: ROLE_USER_TEMPLATES.SYNTHESIZER,
      outputType: "SYNTHESIS", handoffFrom: ["bull-researcher", "bear-researcher"], order: 4, enabled: true,
    },
    {
      id: "trader", name: "Trader", role: "TRADER",
      systemPrompt: ROLE_SYSTEM_PROMPTS.TRADER,
      userPromptTemplate: `Generate proposed orders.\n\nSynthesis:\n{{synthesizer.summaryRationale}}\n\nOpportunities:\n{{synthesizer.rankedOpportunities}}\n\nSymbols: {{symbols}}\nOutput mode: {{outputMode}}`,
      outputType: "PROPOSED_ORDERS", handoffFrom: ["synthesizer"], order: 5, enabled: true,
    },
  ],
  "full-desk": [],
};

const fullDesk: AgentDefinition[] = [...(PRESETS["bull-bear"] ?? [])];
fullDesk.push({
  id: "risk-reviewer", name: "Risk Reviewer", role: "RISK_REVIEWER",
  systemPrompt: ROLE_SYSTEM_PROMPTS.RISK_REVIEWER,
  userPromptTemplate: `Review proposed orders.\n\nOrders:\n{{trader.proposedOrders}}\n\nSynthesis: {{synthesizer.summaryRationale}}\n\nSymbols: {{symbols}}`,
  outputType: "RISK_REVIEW", handoffFrom: ["trader"], order: 6, enabled: true,
});
// Keep the draft trader for risk review, then finish with a final trader so the terminal output is PROPOSED_ORDERS.
fullDesk.push({
  id: "final-trader", name: "Final Order Generator", role: "TRADER",
  systemPrompt: ROLE_SYSTEM_PROMPTS.TRADER + "\n\nIncorporate the risk reviewer's qualitative concerns into your final order selection.",
  userPromptTemplate: `Generate final orders incorporating risk review.\n\nSynthesis: {{synthesizer.summaryRationale}}\nRisk review: {{risk-reviewer.note}}\n\nSymbols: {{symbols}}\nOutput mode: {{outputMode}}`,
  outputType: "PROPOSED_ORDERS", handoffFrom: ["synthesizer", "risk-reviewer"], order: 7, enabled: true,
});
PRESETS["full-desk"] = fullDesk;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TERMINAL_OUTPUT_TYPES: AgentOutputType[] = ["PROPOSED_ORDERS", "RANKED_IDEAS", "SYNTHESIS"];

const ROLE_LABELS: Record<AgentRoleType, string> = {
  ANALYST: "Analyst",
  RESEARCHER: "Researcher",
  SYNTHESIZER: "Synthesizer",
  TRADER: "Trader",
  RISK_REVIEWER: "Risk Reviewer",
};

const OUTPUT_TYPE_LABELS: Record<AgentOutputType, string> = {
  EVIDENCE_ANALYSIS: "Evidence Analysis",
  DEBATE_THESIS: "Debate Thesis",
  SYNTHESIS: "Synthesis",
  PROPOSED_ORDERS: "Proposed Orders ✓",
  RANKED_IDEAS: "Ranked Ideas ✓",
  RISK_REVIEW: "Risk Review",
  SENTIMENT_REPORT: "Sentiment Report",
};

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || "agent";
}

function validateTeam(agents: AgentDefinition[]): string | null {
  const enabled = agents.filter((a) => a.enabled);
  if (enabled.length === 0) return "Team must have at least one enabled agent.";
  const last = enabled.at(-1);
  if (!last) return "Team must have at least one enabled agent.";
  if (!TERMINAL_OUTPUT_TYPES.includes(last.outputType)) {
    return `Last agent "${last.name}" outputs "${last.outputType}". The pipeline must end with Proposed Orders, Ranked Ideas, or Synthesis.`;
  }
  const ids = new Set<string>();
  for (const a of agents) {
    if (ids.has(a.id)) return `Duplicate agent ID: "${a.id}". Each agent must have a unique ID.`;
    ids.add(a.id);
  }
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AgentTeamBuilder({ value, onChange, credentials, initialExpandedAgentId, addToast, showConfirm }: Props) {
  const modelCreds = credentials.filter((c) => c.kind === "MODEL_PROVIDER");
  const agents: AgentDefinition[] = value?.agents ?? [];

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogGrouped, setCatalogGrouped] = useState<Record<AgentCategory, AgentTemplate[]>>({
    ANALYST: [],
    RESEARCHER: [],
    MANAGER: [],
    TRADER: [],
    RISK_DEBATOR: [],
  });

  const loadCatalog = useCallback(async () => {
    const res = await fetch("/api/agent-templates");
    if (!res.ok) return;
    const data = await res.json() as { grouped: Record<AgentCategory, AgentTemplate[]> };
    setCatalogGrouped(data.grouped);
  }, []);

  useEffect(() => {
    if (initialExpandedAgentId) setExpandedId(initialExpandedAgentId);
  }, [initialExpandedAgentId]);

  useEffect(() => {
    if (catalogOpen) void loadCatalog();
  }, [catalogOpen, loadCatalog]);

  const validationError = agents.length > 0 ? validateTeam(agents) : null;
  const parallelGroups = value?.version === 2 ? value.execution.parallelGroups : undefined;

  function setAgents(next: AgentDefinition[]) {
    if (next.length === 0) {
      onChange(null);
      return;
    }
    if (value?.version === 2) {
      onChange({ ...value, agents: next });
    } else {
      onChange({ version: 1, agents: next });
    }
  }

  function addAgent() {
    const newAgent: AgentDefinition = {
      id: `agent-${String(Date.now())}`,
      name: "New Agent",
      role: "ANALYST",
      systemPrompt: ROLE_SYSTEM_PROMPTS.ANALYST,
      userPromptTemplate: ROLE_USER_TEMPLATES.ANALYST,
      outputType: ROLE_OUTPUT_TYPES.ANALYST,
      handoffFrom: [],
      order: agents.length + 1,
      enabled: true,
    };
    const next = [...agents, newAgent];
    setAgents(next);
    setExpandedId(newAgent.id);
  }

  function updateAgent(id: string, patch: Partial<AgentDefinition>) {
    setAgents(agents.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }

  function setAgentCredential(id: string, credentialId: string) {
    setAgents(agents.map((a) => {
      if (a.id !== id) return a;
      const next = { ...a };
      if (credentialId) {
        next.credentialId = credentialId;
      } else {
        delete next.credentialId;
      }
      return next;
    }));
  }

  function deleteAgent(id: string) {
    const performDelete = () => {
      setAgents(agents.filter((a) => a.id !== id));
      if (addToast) addToast("Agent deleted.", "success");
    };

    if (showConfirm) {
      showConfirm(
        "Delete this agent?",
        performDelete,
        { title: "Delete Agent", danger: true }
      );
    } else {
      if (confirm("Delete this agent?")) {
        performDelete();
      }
    }
  }

  function moveAgent(id: string, dir: -1 | 1) {
    const idx = agents.findIndex((a) => a.id === id);
    if (idx < 0) return;
    const next = [...agents];
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= next.length) return;
    const current = next[idx];
    const swap = next[swapIdx];
    if (!current || !swap) return;
    next[idx] = swap;
    next[swapIdx] = current;
    setAgents(next.map((a, i) => ({ ...a, order: i + 1 })));
  }

  async function applyTradingDeskPreset() {
    const res = await fetch("/api/agent-templates");
    const templateIds: Record<string, string> = {};
    if (res.ok) {
      const data = await res.json() as { grouped: Record<AgentCategory, AgentTemplate[]> };
      for (const items of Object.values(data.grouped)) {
        for (const t of items) templateIds[t.slug] = t.id;
      }
    }
    const config = buildTradingDeskTeamConfig(templateIds);
    onChange(config);
    setExpandedId(null);
    if (addToast) addToast("Trading Desk preset loaded", "success");
  }

  function applyPreset(key: string) {
    if (key === "trading-desk") {
      const performApply = () => { void applyTradingDeskPreset(); };
      if (agents.length > 0) {
        if (showConfirm) {
          showConfirm("Replace the current team with the Trading Desk preset?", performApply, { title: "Load Trading Desk", danger: true });
        } else if (confirm("Replace the current team with the Trading Desk preset?")) {
          performApply();
        }
      } else {
        performApply();
      }
      return;
    }

    const preset = PRESETS[key];
    if (!preset) return;

    const performApply = () => {
      setAgents(preset.map((a, i) => ({ ...a, order: i + 1 })));
      setExpandedId(null);
      if (addToast) addToast(`Template loaded: ${key}`, "success");
    };

    if (agents.length > 0) {
      if (showConfirm) {
        showConfirm(
          "Replace the current team with this template?",
          performApply,
          { title: "Load Template", danger: true }
        );
      } else {
        if (confirm("Replace the current team with this template?")) {
          performApply();
        }
      }
    } else {
      performApply();
    }
  }

  function handleRoleChange(id: string, role: AgentRoleType) {
    updateAgent(id, {
      role,
      outputType: ROLE_OUTPUT_TYPES[role],
      systemPrompt: ROLE_SYSTEM_PROMPTS[role],
      userPromptTemplate: ROLE_USER_TEMPLATES[role],
    });
  }

  function handleNameChange(id: string, name: string) {
    updateAgent(id, { name, id: slugify(name) });
    if (expandedId === id) setExpandedId(slugify(name));
  }

  function toggleExpanded(id: string) {
    setExpandedId(expandedId === id ? null : id);
  }

  function insertPromptToken(agent: AgentDefinition, token: string) {
    const textarea = document.getElementById(`user-prompt-${agent.id}`) as HTMLTextAreaElement | null;
    if (!textarea) {
      updateAgent(agent.id, { userPromptTemplate: `${agent.userPromptTemplate}${token}` });
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const nextValue = `${agent.userPromptTemplate.slice(0, start)}${token}${agent.userPromptTemplate.slice(end)}`;
    updateAgent(agent.id, { userPromptTemplate: nextValue });
    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + token.length, start + token.length);
    });
  }

  const agentsBefore = (id: string) => {
    const idx = agents.findIndex((a) => a.id === id);
    return agents.slice(0, idx);
  };

  function addFromCatalog(template: AgentTemplate) {
    const newAgent: AgentDefinition = {
      id: template.slug,
      name: template.name,
      role: template.role,
      systemPrompt: template.systemPrompt,
      userPromptTemplate: template.userPromptTemplate,
      outputType: template.outputType,
      specialization: template.specialization,
      templateId: template.id,
      handoffFrom: [],
      order: agents.length + 1,
      enabled: true,
    };
    setAgents([...agents, newAgent]);
    setExpandedId(newAgent.id);
    setCatalogOpen(false);
    if (addToast) addToast(`Added ${template.name} from catalog`, "success");
  }

  function clearTeam() {
    const performClear = () => {
      setAgents([]);
      if (addToast) addToast("Agent team cleared.", "info");
    };

    if (showConfirm) {
      showConfirm(
        "Clear the entire agent team?",
        performClear,
        { title: "Clear Team", danger: true }
      );
    } else {
      if (confirm("Clear the entire agent team?")) {
        performClear();
      }
    }
  }

  return (
    <div className="agent-team-builder">

      {/* Toolbar */}
      <div className="agent-team-toolbar">
        <select
          defaultValue=""
          onChange={(e) => { if (e.target.value) applyPreset(e.target.value); e.target.value = ""; }}
          className="agent-team-template-select"
        >
          <option value="" disabled>Load template…</option>
          <option value="2-step">2-Step (Default)</option>
          <option value="bull-bear">Bull / Bear Debate</option>
          <option value="full-desk">Full Research Desk</option>
          <option value="trading-desk">Trading Desk (14-agent)</option>
        </select>
        <button
          type="button"
          onClick={() => setCatalogOpen((o) => !o)}
          className="button button-secondary button-sm"
        >
          Add from catalog
        </button>
        <button
          type="button"
          onClick={addAgent}
          className="button button-secondary button-sm"
        >
          + Add agent
        </button>
        {agents.length > 0 && (
          <button
            type="button"
            onClick={clearTeam}
            className="button button-danger button-sm"
          >
            Clear team
          </button>
        )}
      </div>

      {catalogOpen && (
        <div className="agents-catalog-sidebar" style={{ marginBottom: "var(--space-3)" }}>
          <div className="agents-catalog-sidebar-header">
            <h3 className="agents-catalog-title">Catalog</h3>
            <button type="button" className="agent-text-button" onClick={() => setCatalogOpen(false)}>Close</button>
          </div>
          {(["ANALYST", "RESEARCHER", "MANAGER", "TRADER", "RISK_DEBATOR"] as AgentCategory[]).map((cat) => (
            <div key={cat} className="agents-category-section">
              <div className="agents-category-header"><span>{cat}</span></div>
              <div className="ag-catalog-palette">
                {(catalogGrouped[cat] ?? []).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="ag-catalog-chip"
                    onClick={() => addFromCatalog(t)}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Agent graph canvas */}
      {agents.length > 0 && (
        <div style={{ marginBottom: "var(--space-4)" }}>
          <AgentGraphCanvas
            agents={agents}
            credentials={credentials}
            readOnly={false}
            selectedAgentId={expandedId}
            {...(parallelGroups ? { parallelGroups } : {})}
            onAgentSelect={(id) => setExpandedId(id === expandedId ? null : id ?? null)}
            onAgentsChange={(updated) => setAgents(updated)}
            onAddFromCatalog={addFromCatalog}
            catalogTemplates={Object.values(catalogGrouped).flat()}
            className="ag-canvas-tall"
          />
          {validationError && (
            <p className="agent-team-warning" style={{ marginTop: "var(--space-2)" }}>
              ⚠ {validationError}
            </p>
          )}
        </div>
      )}

      {agents.length === 0 && (
        <p className="agent-team-empty">
          No agent team defined — strategy will use the legacy 2-step flow. Load a template or add agents above.
        </p>
      )}

      {agents.length > 0 && modelCreds.length === 0 && (
        <p className="agent-team-warning">
          No MODEL_PROVIDER credential is saved. Agents without a specific credential do not have a fallback model.
        </p>
      )}

      {/* Agent cards */}
      {agents.map((agent, idx) => (
        <div
          key={agent.id}
          className={`agent-config-card ${expandedId === agent.id ? "is-expanded" : ""} ${agent.enabled ? "" : "is-disabled"}`}
          data-role={agent.role}
        >
          {/* Card header */}
          <div
            className="agent-config-header"
            onClick={() => {
              toggleExpanded(agent.id);
            }}
          >
            <span className="agent-role-badge" data-role={agent.role}>
              {ROLE_LABELS[agent.role]}
            </span>
            <span className="agent-config-name">{agent.name}</span>
            <span className="agent-config-meta">{OUTPUT_TYPE_LABELS[agent.outputType]}</span>
            {agent.credentialId && (
              <span className="agent-config-meta">
                {modelCreds.find((c) => c.id === agent.credentialId)?.label ?? "custom model"}
              </span>
            )}
            <div className="agent-config-actions">
              <button type="button" onClick={(e) => { e.stopPropagation(); updateAgent(agent.id, { enabled: !agent.enabled }); }}
                className="agent-text-button">
                {agent.enabled ? "Disable" : "Enable"}
              </button>
              <button type="button" onClick={(e) => { e.stopPropagation(); deleteAgent(agent.id); }}
                className="agent-text-button is-danger">✕</button>
            </div>
          </div>

          {/* Expanded editor */}
          {expandedId === agent.id && (
            <div className="agent-config-editor">
              <div className="agent-config-grid">
                <label>
                  Name
                  <input
                    value={agent.name}
                    onChange={(e) => {
                      handleNameChange(agent.id, e.target.value);
                    }}
                  />
                </label>
                <label>
                  Role
                  <select
                    value={agent.role}
                    onChange={(e) => {
                      handleRoleChange(agent.id, e.target.value as AgentRoleType);
                    }}
                  >
                    {(Object.keys(ROLE_LABELS) as AgentRoleType[]).map((r) => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Output type
                  <select
                    value={agent.outputType}
                    onChange={(e) => {
                      updateAgent(agent.id, { outputType: e.target.value as AgentOutputType });
                    }}
                  >
                    {(Object.keys(OUTPUT_TYPE_LABELS) as AgentOutputType[]).map((t) => (
                      <option key={t} value={t}>{OUTPUT_TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Model credential
                  <select
                    value={agent.credentialId ?? ""}
                    onChange={(e) => {
                      setAgentCredential(agent.id, e.target.value);
                    }}
                  >
                    <option value="">(Default — first MODEL_PROVIDER credential)</option>
                    {modelCreds.map((c) => (
                      <option key={c.id} value={c.id}>{c.label} ({c.provider})</option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Handoff from */}
              {agentsBefore(agent.id).length > 0 && (
                <label>
                  Receives output from
                  <div className="agent-checkbox-list">
                    {agentsBefore(agent.id).map((prev) => (
                      <label key={prev.id} className="agent-checkbox-chip">
                        <input
                          type="checkbox"
                          checked={agent.handoffFrom.includes(prev.id)}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...agent.handoffFrom, prev.id]
                              : agent.handoffFrom.filter((id) => id !== prev.id);
                            updateAgent(agent.id, { handoffFrom: next });
                          }}
                        />
                        {prev.name}
                      </label>
                    ))}
                  </div>
                  <small className="field-help">
                    Selected agents&apos; outputs are available as <code>{"{{agentId.fieldName}}"}</code> in your prompt template.
                  </small>
                </label>
              )}

              {/* Variable hints */}
              {agent.handoffFrom.length > 0 && (
                <div className="agent-variable-hints">
                  Available variables:{" "}
                  {agent.handoffFrom.flatMap((hId) => {
                    const src = agents.find((a) => a.id === hId);
                    if (!src) return [];
                    const fields = getOutputFields(src.outputType);
                    return fields.map((f) => (
                      <code
                        key={`${hId}.${f}`}
                        className="agent-variable-token"
                        onClick={() => {
                          const token = `{{${hId}.${f}}}`;
                          insertPromptToken(agent, token);
                        }}
                      >
                        {`{{${hId}.${f}}}`}
                      </code>
                    ));
                  })}
                </div>
              )}

              {/* System prompt */}
              <label>
                System prompt
                <textarea
                  value={agent.systemPrompt}
                  onChange={(e) => {
                    updateAgent(agent.id, { systemPrompt: e.target.value });
                  }}
                  rows={8}
                />
              </label>

              {/* User prompt template */}
              <label>
                User prompt template
                <textarea
                  id={`user-prompt-${agent.id}`}
                  value={agent.userPromptTemplate}
                  onChange={(e) => {
                    updateAgent(agent.id, { userPromptTemplate: e.target.value });
                  }}
                  rows={5}
                />
                <small className="field-help">
                  Use <code>{"{{symbols}}"}</code>, <code>{"{{outputMode}}"}</code>, <code>{"{{evidenceItems}}"}</code>, and <code>{"{{agentId.fieldName}}"}</code> from prior agents.
                </small>
              </label>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function getOutputFields(outputType: AgentOutputType): string[] {
  switch (outputType) {
    case "EVIDENCE_ANALYSIS": return ["claims", "evidenceRefs", "freshnessWarnings", "confidence", "uncertaintyNote"];
    case "DEBATE_THESIS": return ["side", "thesis", "conviction", "supportingRefs", "counterArguments"];
    case "SYNTHESIS": return ["rankedOpportunities", "rejectedSymbols", "overallUncertainty", "summaryRationale"];
    case "PROPOSED_ORDERS": return ["rationale", "proposedOrders", "uncertaintyNote"];
    case "RANKED_IDEAS": return ["rationale", "rankedIdeas"];
    case "RISK_REVIEW": return ["concerns", "mitigations", "qualitativeRiskScore", "note"];
    default: return [];
  }
}
