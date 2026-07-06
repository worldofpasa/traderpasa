"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ChevronRight, GitFork, Plus } from "lucide-react";
import { getCsrfHeader } from "../csrf-client";
import { DashboardShell } from "../components/dashboard-shell";
import { useFeedback } from "../components/use-feedback";
import { useSessionUser } from "../components/use-session-user";
import { getStrategyCron } from "../lib/strategy-utils";
import type { BrokerAccount, StrategyInstance, StrategyTemplate } from "../lib/strategy-types";
import { ForkStrategyDialog } from "./fork-strategy-dialog";

export default function StrategiesPage() {
  const router = useRouter();
  const { user, loading: userLoading } = useSessionUser();
  const { addToast, feedbackUi } = useFeedback();

  const [strategies, setStrategies] = useState<StrategyInstance[]>([]);
  const [brokerAccounts, setBrokerAccounts] = useState<BrokerAccount[]>([]);
  const [templates, setTemplates] = useState<StrategyTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForkModal, setShowForkModal] = useState(false);
  const [forkTemplateId, setForkTemplateId] = useState("");
  const [forkName, setForkName] = useState("");
  const [forkSourceName, setForkSourceName] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const [strategiesRes, accountsRes, templatesRes] = await Promise.all([
      fetch("/api/strategy-instances"),
      fetch("/api/broker-accounts"),
      fetch("/api/strategy-templates"),
    ]);
    const strategiesData = (await strategiesRes.json()) as { instances?: StrategyInstance[] };
    const accountsData = (await accountsRes.json()) as { brokerAccounts?: BrokerAccount[] };
    const templatesData = (await templatesRes.json()) as { templates?: StrategyTemplate[] };
    setStrategies(strategiesData.instances ?? []);
    setBrokerAccounts(accountsData.brokerAccounts ?? []);
    setTemplates(templatesData.templates ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      setLoading(true);
      try {
        await loadData();
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [loadData]);

  async function handleForkSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!forkTemplateId) return;
    try {
      const res = await fetch("/api/strategy-instances", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getCsrfHeader() },
        body: JSON.stringify({ templateId: forkTemplateId, name: forkName || undefined }),
      });
      const data = (await res.json()) as { instance?: { id: string }; error?: { message?: string } };
      if (!res.ok) throw new Error(data.error?.message ?? "Fork failed.");
      setShowForkModal(false);
      setForkTemplateId("");
      setForkName("");
      setForkSourceName(null);
      await loadData();
      if (data.instance?.id) router.push(`/strategies/${data.instance.id}`);
      else addToast("Strategy forked.", "success");
    } catch (e) {
      addToast(e instanceof Error ? e.message : "Fork failed.", "error");
    }
  }

  const headerActions = (
    <>
      <button
        type="button"
        onClick={() => {
          setShowForkModal(true);
          setForkName("");
          setForkTemplateId("");
          setForkSourceName(null);
        }}
        className="button button-primary header-action-btn"
      >
        <GitFork size={15} /> Fork Base Template
      </button>
      <button type="button" disabled title="Strategy builder coming soon" className="button button-secondary header-action-btn">
        <Plus size={15} /> Create Strategy
      </button>
    </>
  );

  return (
    <DashboardShell
      user={user}
      loading={userLoading || loading}
      title="Strategies"
      activeNav="strategies"
      headerActions={headerActions}
      feedbackUi={feedbackUi}
    >
      {strategies.length === 0 ? (
        <div className="glass-card glass-card-empty">
          <p className="empty-text">No strategy instances found. Fork a base template to start.</p>
          <button
            type="button"
            onClick={() => {
              setShowForkModal(true);
              setForkName("");
              setForkTemplateId("");
              setForkSourceName(null);
            }}
            className="button button-primary"
          >
            <GitFork size={15} /> Fork Your First Strategy
          </button>
        </div>
      ) : (
        <div className="strategy-list-grid">
          {strategies.map((strategy) => {
            const broker = brokerAccounts.find((a) => a.id === strategy.brokerAccountId);
            return (
              <Link key={strategy.id} href={`/strategies/${strategy.id}`} className="strategy-list-card">
                <div className="strategy-list-card-header">
                  <h3>{strategy.name}</h3>
                  <ChevronRight size={16} />
                </div>
                <div className="strategy-list-card-badges">
                  <span className={`badge ${strategy.status === "ENABLED" ? "badge-success" : "badge-warning"}`}>
                    {strategy.status}
                  </span>
                  <span className={`badge ${strategy.executionMode === "LIVE" ? "badge-live" : "badge-paper"}`}>
                    {strategy.executionMode}
                  </span>
                  {broker && <span className="badge badge-paper">{broker.label}</span>}
                </div>
                <p className="strategy-list-card-meta font-mono">
                  {strategy.symbols.slice(0, 4).join(", ") || "No symbols"}
                  {strategy.symbols.length > 4 ? ` +${strategy.symbols.length - 4}` : ""}
                  {" · "}
                  {getStrategyCron(strategy.scheduleConfig)}
                </p>
              </Link>
            );
          })}
        </div>
      )}

      <ForkStrategyDialog
        open={showForkModal}
        onClose={() => {
          setShowForkModal(false);
          setForkTemplateId("");
          setForkName("");
          setForkSourceName(null);
        }}
        templates={templates}
        forkTemplateId={forkTemplateId}
        forkName={forkName}
        forkSourceName={forkSourceName}
        onTemplateChange={setForkTemplateId}
        onNameChange={setForkName}
        onSubmit={handleForkSubmit}
      />
    </DashboardShell>
  );
}
