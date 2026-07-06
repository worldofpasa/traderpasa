"use client";

import { useCallback, useEffect, useState } from "react";
import type { AgentCategory, AgentTemplate } from "@pasa-trader/schemas";
import { OUTPUT_TYPE_SCHEMA_HINTS } from "@pasa-trader/agents";
import { getCsrfHeader } from "../csrf-client";
import { AgentBuilderPlaceholder } from "./agent-builder-placeholder";
import { AgentTemplateForm } from "./agent-template-form";

const CATEGORY_ORDER: AgentCategory[] = [
  "ANALYST",
  "RESEARCHER",
  "MANAGER",
  "TRADER",
  "RISK_DEBATOR",
];

const CATEGORY_LABELS: Record<AgentCategory, string> = {
  ANALYST: "Analysts",
  RESEARCHER: "Researchers",
  MANAGER: "Managers",
  TRADER: "Trader",
  RISK_DEBATOR: "Risk Management",
};

interface Props {
  onMessage?: (message: string, type?: "success" | "error") => void;
}

export function AgentsTab({ onMessage }: Props) {
  const [grouped, setGrouped] = useState<Record<AgentCategory, AgentTemplate[]>>({
    ANALYST: [],
    RESEARCHER: [],
    MANAGER: [],
    TRADER: [],
    RISK_DEBATOR: [],
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<AgentTemplate | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<AgentCategory>>(
    () => new Set(CATEGORY_ORDER),
  );
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"view" | "create" | "edit" | "builder">("builder");

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/agent-templates");
      if (!res.ok) throw new Error("Failed to load agent templates");
      const data = await res.json() as { grouped: Record<AgentCategory, AgentTemplate[]> };
      setGrouped(data.grouped);
    } catch (err) {
      onMessage?.(err instanceof Error ? err.message : "Failed to load agents", "error");
    } finally {
      setLoading(false);
    }
  }, [onMessage]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const loadDetail = useCallback(async (id: string) => {
    const res = await fetch(`/api/agent-templates/${id}`);
    if (!res.ok) return;
    const data = await res.json() as { template: AgentTemplate };
    setSelected(data.template);
    setSelectedId(id);
    setMode("view");
  }, []);

  const toggleCategory = (cat: AgentCategory) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this agent template?")) return;
    const res = await fetch(`/api/agent-templates/${id}`, {
      method: "DELETE",
      headers: { ...getCsrfHeader() },
    });
    if (!res.ok) {
      onMessage?.("Could not delete template", "error");
      return;
    }
    onMessage?.("Agent template deleted", "success");
    setSelected(null);
    setSelectedId(null);
    await loadTemplates();
  };

  const handleDuplicate = async (id: string) => {
    const res = await fetch(`/api/agent-templates/${id}/duplicate`, {
      method: "POST",
      headers: { ...getCsrfHeader() },
    });
    if (!res.ok) {
      onMessage?.("Could not duplicate template", "error");
      return;
    }
    const data = await res.json() as { template: AgentTemplate };
    onMessage?.("Agent template duplicated", "success");
    await loadTemplates();
    await loadDetail(data.template.id);
  };

  return (
    <div className="agents-catalog-layout">
      <aside className="agents-catalog-sidebar">
        <div className="agents-catalog-sidebar-header">
          <h2 className="agents-catalog-title">Agents</h2>
          <button
            type="button"
            className="button button-primary button-sm"
            onClick={() => {
              setMode("create");
              setSelected(null);
              setSelectedId(null);
            }}
          >
            + New Agent
          </button>
        </div>

        <button
          type="button"
          className={`agents-builder-entry${mode === "builder" ? " is-active" : ""}`}
          onClick={() => {
            setMode("builder");
            setSelected(null);
            setSelectedId(null);
          }}
        >
          <span className="agents-builder-entry-title">Agent Builder</span>
          <span className="agents-builder-entry-badge">Soon</span>
          <span className="agents-builder-entry-desc">Build an agent from a natural-language description</span>
        </button>

        <div className="agents-catalog-divider">
          <span>Catalog</span>
        </div>

        {loading && <p className="agents-catalog-loading">Loading agents…</p>}

        {!loading && CATEGORY_ORDER.map((cat) => {
          const items = grouped[cat] ?? [];
          const open = expandedCategories.has(cat);
          return (
            <div key={cat} className="agents-category-section">
              <button
                type="button"
                className="agents-category-header"
                onClick={() => toggleCategory(cat)}
              >
                <span>{CATEGORY_LABELS[cat]}</span>
                <span className="agents-category-count">{items.length}</span>
              </button>
              {open && (
                <ul className="agents-category-list">
                  {items.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        className={`agents-template-item${selectedId === t.id ? " is-active" : ""}`}
                        onClick={() => void loadDetail(t.id)}
                      >
                        <span className="agents-template-name">{t.name}</span>
                        <span className="agents-template-slug">{t.slug}</span>
                        {t.isBuiltin && <span className="agents-builtin-badge">Built-in</span>}
                      </button>
                    </li>
                  ))}
                  {items.length === 0 && (
                    <li className="agents-category-empty">No agents in this category</li>
                  )}
                </ul>
              )}
            </div>
          );
        })}
      </aside>

      <section className="agents-catalog-detail">
        {mode === "builder" && <AgentBuilderPlaceholder />}

        {mode === "create" && (
          <AgentTemplateForm
            onCancel={() => setMode("view")}
            onSaved={async (template) => {
              await loadTemplates();
              await loadDetail(template.id);
              onMessage?.("Agent template created", "success");
            }}
          />
        )}

        {mode === "edit" && selected && (
          <AgentTemplateForm
            initial={selected}
            onCancel={() => setMode("view")}
            onSaved={async (template) => {
              await loadTemplates();
              await loadDetail(template.id);
              onMessage?.("Agent template updated", "success");
            }}
          />
        )}

        {mode === "view" && !selected && (
          <div className="agents-detail-empty">
            <p>Select an agent from the catalog, open Agent Builder, or create a new agent manually.</p>
          </div>
        )}

        {mode === "view" && selected && (
          <div className="agents-detail-panel">
            <header className="agents-detail-header">
              <div>
                <h3>{selected.name}</h3>
                <p className="agents-detail-meta">
                  <span className="agent-role-badge" data-role={selected.role}>{selected.role}</span>
                  <span className="agents-detail-slug">{selected.slug}</span>
                  <span>{selected.outputType}</span>
                </p>
              </div>
              <div className="agents-detail-actions">
                <button type="button" className="button button-secondary button-sm" onClick={() => void handleDuplicate(selected.id)}>
                  Duplicate
                </button>
                {!selected.isBuiltin && (
                  <>
                    <button type="button" className="button button-secondary button-sm" onClick={() => setMode("edit")}>
                      Edit
                    </button>
                    <button type="button" className="button button-danger button-sm" onClick={() => void handleDelete(selected.id)}>
                      Delete
                    </button>
                  </>
                )}
              </div>
            </header>

            <p className="agents-detail-description">{selected.description}</p>

            <div className="agents-detail-section">
              <h4>System Prompt</h4>
              <pre className="agents-prompt-block">{selected.systemPrompt}</pre>
            </div>

            <div className="agents-detail-section">
              <h4>User Prompt Template</h4>
              <pre className="agents-prompt-block">{selected.userPromptTemplate}</pre>
            </div>

            <div className="agents-detail-section">
              <h4>Variables</h4>
              <table className="agents-vars-table">
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Source</th>
                    <th>Required</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.variables.map((v) => (
                    <tr key={v.key}>
                      <td className="mono">{`{{${v.key}}}`}</td>
                      <td>{v.source}</td>
                      <td>{v.required ? "Yes" : "No"}</td>
                      <td>{v.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selected.toolRefs.length > 0 && (
              <div className="agents-detail-section">
                <h4>Evidence / Tools</h4>
                <ul className="agents-tools-list">
                  {selected.toolRefs.map((t) => (
                    <li key={t.id}>
                      <strong>{t.label}</strong>
                      <span className="agents-tool-id mono">{t.id}</span>
                      <span className="agents-tool-reliability">{t.reliability}</span>
                      {t.evidenceConnectorId && (
                        <span className="agents-tool-connector">→ {t.evidenceConnectorId}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="agents-detail-section">
              <h4>Output Schema</h4>
              <pre className="agents-prompt-block mono">{OUTPUT_TYPE_SCHEMA_HINTS[selected.outputType]}</pre>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
