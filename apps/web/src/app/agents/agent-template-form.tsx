"use client";

import { useState } from "react";
import type { AgentTemplate } from "@pasa-trader/schemas";
import { getCsrfHeader } from "../csrf-client";

interface Props {
  initial?: AgentTemplate;
  onCancel: () => void;
  onSaved: (template: AgentTemplate) => void;
}

const CATEGORIES = ["ANALYST", "RESEARCHER", "MANAGER", "TRADER", "RISK_DEBATOR"] as const;
const ROLES = ["ANALYST", "RESEARCHER", "SYNTHESIZER", "TRADER", "RISK_REVIEWER"] as const;
const OUTPUT_TYPES = [
  "EVIDENCE_ANALYSIS",
  "DEBATE_THESIS",
  "SYNTHESIS",
  "PROPOSED_ORDERS",
  "RANKED_IDEAS",
  "RISK_REVIEW",
  "SENTIMENT_REPORT",
] as const;
const SPECIALIZATIONS = [
  "MARKET", "SENTIMENT", "NEWS", "FUNDAMENTALS",
  "BULL", "BEAR", "RESEARCH_MANAGER", "PORTFOLIO_MANAGER",
  "TRADER", "AGGRESSIVE", "CONSERVATIVE", "NEUTRAL",
] as const;

export function AgentTemplateForm({ initial, onCancel, onSaved }: Props) {
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? "ANALYST");
  const [role, setRole] = useState(initial?.role ?? "ANALYST");
  const [specialization, setSpecialization] = useState(initial?.specialization ?? "MARKET");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [systemPrompt, setSystemPrompt] = useState(initial?.systemPrompt ?? "");
  const [userPromptTemplate, setUserPromptTemplate] = useState(initial?.userPromptTemplate ?? "");
  const [outputType, setOutputType] = useState(initial?.outputType ?? "EVIDENCE_ANALYSIS");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      slug,
      name,
      category,
      role,
      specialization,
      description,
      systemPrompt,
      userPromptTemplate,
      outputType,
      variables: initial?.variables ?? [],
      toolRefs: initial?.toolRefs ?? [],
      defaultDebateSide: initial?.defaultDebateSide,
    };

    const url = initial ? `/api/agent-templates/${initial.id}` : "/api/agent-templates";
    const method = initial ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...getCsrfHeader(),
      },
      body: JSON.stringify(payload),
    });

    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: { message?: string } };
      setError(data.error?.message ?? "Save failed");
      return;
    }

    const data = await res.json() as { template: AgentTemplate };
    onSaved(data.template);
  };

  return (
    <form className="agents-template-form" onSubmit={(e) => void handleSubmit(e)}>
      <h3>{initial ? "Edit Agent" : "New Agent"}</h3>
      {error && <p className="agent-team-warning">{error}</p>}

      <div className="agents-form-grid">
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Slug
          <input value={slug} onChange={(e) => setSlug(e.target.value)} pattern="[a-z0-9-]+" required disabled={!!initial?.isBuiltin} />
        </label>
        <label>
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label>
          Role
          <select value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label>
          Specialization
          <select value={specialization} onChange={(e) => setSpecialization(e.target.value as typeof specialization)}>
            {SPECIALIZATIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>
          Output Type
          <select value={outputType} onChange={(e) => setOutputType(e.target.value as typeof outputType)}>
            {OUTPUT_TYPES.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
      </div>

      <label>
        Description
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} required />
      </label>

      <label>
        System Prompt
        <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} rows={8} required />
      </label>

      <label>
        User Prompt Template
        <textarea value={userPromptTemplate} onChange={(e) => setUserPromptTemplate(e.target.value)} rows={6} required />
      </label>

      <div className="agents-form-actions">
        <button type="button" className="button button-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="button button-primary" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
