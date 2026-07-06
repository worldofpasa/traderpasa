"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  Copy,
  GitFork,
  Play,
  Power,
  SquarePen,
  Trash2,
} from "lucide-react";
import { getCsrfHeader } from "../../csrf-client";
import { DashboardShell } from "../../components/dashboard-shell";
import { useFeedback } from "../../components/use-feedback";
import { useSessionUser } from "../../components/use-session-user";
import { AgentPipelineView } from "../../agent-pipeline-view";
import { getStrategyCron } from "../../lib/strategy-utils";
import type {
  BrokerAccount,
  Credential,
  JobRun,
  StrategyInstance,
  StrategyTabId,
  StrategyTemplate,
} from "../../lib/strategy-types";
import { STRATEGY_TABS } from "../../lib/strategy-types";
import { ForkStrategyDialog } from "../fork-strategy-dialog";
import { LiveAckDialog } from "../live-ack-dialog";
import { StrategyConfigForm } from "../strategy-config-form";
import { StrategyRunsList } from "../strategy-runs-list";

function isValidTab(value: string | null): value is StrategyTabId {
  return value === "overview" || value === "agents" || value === "runs" || value === "settings";
}

interface StrategyDetailClientProps {
  strategyId: string;
}

export function StrategyDetailClient({ strategyId }: StrategyDetailClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: userLoading } = useSessionUser();
  const { addToast, showConfirm, feedbackUi } = useFeedback();

  const tabParam = searchParams.get("tab");
  const activeTab: StrategyTabId = isValidTab(tabParam) ? tabParam : "agents";
  const focusAgentId = searchParams.get("agent");
  const selectedRunId = searchParams.get("run");

  const [strategy, setStrategy] = useState<StrategyInstance | null>(null);
  const [draft, setDraft] = useState<StrategyInstance | null>(null);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [brokerAccounts, setBrokerAccounts] = useState<BrokerAccount[]>([]);
  const [templates, setTemplates] = useState<StrategyTemplate[]>([]);
  const [runs, setRuns] = useState<JobRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [runsLoading, setRunsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showForkModal, setShowForkModal] = useState(false);
  const [forkTemplateId, setForkTemplateId] = useState("");
  const [forkName, setForkName] = useState("");
  const [forkSourceName, setForkSourceName] = useState<string | null>(null);
  const [showLiveAck, setShowLiveAck] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const updateStrategyUrl = useCallback(
    (tab: StrategyTabId, options?: { agentId?: string | null; runId?: string | null }) => {
      const params = new URLSearchParams();
      params.set("tab", tab);
      if (options?.agentId) params.set("agent", options.agentId);
      if (tab === "runs" && options?.runId) params.set("run", options.runId);
      router.replace(`/strategies/${strategyId}?${params.toString()}`);
    },
    [router, strategyId],
  );

  const setTab = useCallback(
    (tab: StrategyTabId, agentId?: string | null) => {
      updateStrategyUrl(tab, agentId ? { agentId } : undefined);
    },
    [updateStrategyUrl],
  );

  const setSelectedRun = useCallback(
    (runId: string | null) => {
      updateStrategyUrl("runs", runId ? { runId } : undefined);
    },
    [updateStrategyUrl],
  );

  const loadStrategy = useCallback(async () => {
    const res = await fetch(`/api/strategy-instances/${strategyId}`);
    if (!res.ok) {
      if (res.status === 404) throw new Error("Strategy not found.");
      throw new Error("Failed to load strategy.");
    }
    const data = (await res.json()) as { instance: StrategyInstance };
    setStrategy(data.instance);
    setDraft(JSON.parse(JSON.stringify(data.instance)) as StrategyInstance);
  }, [strategyId]);

  const loadRuns = useCallback(async () => {
    setRunsLoading(true);
    try {
      const res = await fetch(`/api/job-runs?strategyId=${strategyId}&limit=50`);
      if (!res.ok) throw new Error("Failed to load runs.");
      const data = (await res.json()) as { runs: JobRun[] };
      setRuns(data.runs ?? []);
    } finally {
      setRunsLoading(false);
    }
  }, [strategyId]);

  const loadSupportData = useCallback(async () => {
    const [credsRes, accountsRes, templatesRes] = await Promise.all([
      fetch("/api/credentials"),
      fetch("/api/broker-accounts"),
      fetch("/api/strategy-templates"),
    ]);
    const credsData = (await credsRes.json()) as { credentials?: Credential[] };
    const accountsData = (await accountsRes.json()) as { brokerAccounts?: BrokerAccount[] };
    const templatesData = (await templatesRes.json()) as { templates?: StrategyTemplate[] };
    setCredentials(credsData.credentials ?? []);
    setBrokerAccounts(accountsData.brokerAccounts ?? []);
    setTemplates(templatesData.templates ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      setLoading(true);
      setErrorMessage(null);
      try {
        await Promise.all([loadStrategy(), loadSupportData(), loadRuns()]);
      } catch (e) {
        if (!cancelled) setErrorMessage(e instanceof Error ? e.message : "Failed to load strategy.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [loadStrategy, loadSupportData, loadRuns]);

  const brokerLabel = useMemo(() => {
    if (!strategy) return null;
    const broker = brokerAccounts.find((a) => a.id === strategy.brokerAccountId);
    return broker ? `${broker.label} (${broker.environment})` : null;
  }, [strategy, brokerAccounts]);

  async function runAction(actionName: string, apiCall: () => Promise<Response>) {
    setSaving(true);
    setErrorMessage(null);
    try {
      const res = await apiCall();
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || `HTTP error ${res.status}`);
      await loadStrategy();
      await loadRuns();
      return data;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Action failed.";
      setErrorMessage(message);
      throw e;
    } finally {
      setSaving(false);
    }
  }

  function handleToggleStatus() {
    if (!strategy) return;
    const action = strategy.status === "ENABLED" ? "disable" : "enable";
    const hasCron = !!getStrategyCron(strategy.scheduleConfig, "");

    if (action === "disable") {
      const cronNote = hasCron ? " Scheduled cron runs will stop until re-enabled." : "";
      showConfirm(
        `Disable strategy "${strategy.name}"?${cronNote}`,
        () => {
          void runAction("disable", () =>
            fetch(`/api/strategy-instances/${strategy.id}/disable`, {
              method: "POST",
              headers: { ...getCsrfHeader() },
            }),
          ).then(() => addToast("Strategy disabled.", "info"));
        },
        { title: "Disable Strategy" },
      );
      return;
    }

    void runAction("enable", () =>
      fetch(`/api/strategy-instances/${strategy.id}/enable`, {
        method: "POST",
        headers: { ...getCsrfHeader() },
      }),
    ).then(() => addToast("Strategy enabled.", "success"));
  }

  function handleTrigger() {
    if (!strategy) return;
    void runAction("trigger", () =>
      fetch(`/api/strategy-instances/${strategy.id}/trigger`, {
        method: "POST",
        headers: { ...getCsrfHeader() },
      }),
    ).then(() => {
      addToast("Strategy run enqueued.", "success");
      setTab("runs");
    });
  }

  function handleDelete() {
    if (!strategy) return;
    showConfirm(
      `Delete strategy "${strategy.name}"? This cannot be undone.`,
      () => {
        void runAction("delete", () =>
          fetch(`/api/strategy-instances/${strategy.id}/delete`, {
            method: "POST",
            headers: { ...getCsrfHeader() },
          }),
        ).then(() => {
          addToast("Strategy deleted.", "info");
          router.push("/strategies");
        });
      },
      { title: "Delete Strategy", danger: true },
    );
  }

  function handleForkSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!forkTemplateId) return;
    void runAction("fork", () =>
      fetch("/api/strategy-instances", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getCsrfHeader() },
        body: JSON.stringify({ templateId: forkTemplateId, name: forkName || undefined }),
      }),
    ).then((data: { instance?: { id: string } }) => {
      setShowForkModal(false);
      setForkTemplateId("");
      setForkName("");
      setForkSourceName(null);
      if (data.instance?.id) router.push(`/strategies/${data.instance.id}`);
      else router.push("/strategies");
    });
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!draft || !strategy) return;

    const saveChanges = () => {
      void runAction("save", () =>
        fetch(`/api/strategy-instances/${strategy.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...getCsrfHeader() },
          body: JSON.stringify({
            name: draft.name,
            description: draft.description,
            brokerAccountId: draft.brokerAccountId,
            watchlistMode: draft.watchlistMode,
            symbols: draft.symbols,
            outputMode: draft.outputMode,
            executionMode: draft.executionMode,
            modelLoggingDepth: draft.modelLoggingDepth,
            stepModelConfig: draft.stepModelConfig,
            agentTeamConfig:
              draft.agentTeamConfig && Object.keys(draft.agentTeamConfig).length > 0
                ? draft.agentTeamConfig
                : undefined,
            riskConfig: draft.riskConfig,
            sourceConfig: draft.sourceConfig,
            marketSessionRules: draft.marketSessionRules,
            scheduleConfig: draft.scheduleConfig,
            trailingStopConfig: draft.trailingStopConfig,
          }),
        }),
      ).then(() => addToast("Strategy settings saved.", "success"));
    };

    const origAgents = ((strategy.agentTeamConfig as { agents?: Array<{ id: string }> })?.agents ?? []);
    const newAgents = ((draft.agentTeamConfig as { agents?: Array<{ id: string }> })?.agents ?? []);
    const structureChanged =
      origAgents.length !== newAgents.length || origAgents.some((a, i) => a.id !== newAgents[i]?.id);

    if (structureChanged) {
      showConfirm(
        `Agent team structure changed for "${draft.name}". Structural changes require forking a new strategy.`,
        () => {
          setShowForkModal(true);
          setForkName(`${draft.name} (copy)`);
          setForkTemplateId(draft.templateId);
          setForkSourceName(draft.name);
        },
        { title: "Fork Instead of Edit?", confirmLabel: "Fork as New Strategy" },
      );
      return;
    }

    if (draft.executionMode === "LIVE" && !draft.liveAcknowledgedAt) {
      setShowLiveAck(true);
      return;
    }

    saveChanges();
  }

  async function handleLiveAckConfirm() {
    if (!draft || !strategy) return;
    setShowLiveAck(false);
    const res = await fetch(`/api/strategy-instances/${strategy.id}/acknowledge`, {
      method: "POST",
      headers: { ...getCsrfHeader() },
    });
    if (!res.ok) {
      addToast("Failed to acknowledge live trading.", "error");
      return;
    }
    const acknowledgedDraft = { ...draft, liveAcknowledgedAt: new Date().toISOString() };
    setDraft(acknowledgedDraft);
    void runAction("save", () =>
      fetch(`/api/strategy-instances/${strategy.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getCsrfHeader() },
        body: JSON.stringify({
          name: acknowledgedDraft.name,
          description: acknowledgedDraft.description,
          brokerAccountId: acknowledgedDraft.brokerAccountId,
          watchlistMode: acknowledgedDraft.watchlistMode,
          symbols: acknowledgedDraft.symbols,
          outputMode: acknowledgedDraft.outputMode,
          executionMode: acknowledgedDraft.executionMode,
          modelLoggingDepth: acknowledgedDraft.modelLoggingDepth,
          stepModelConfig: acknowledgedDraft.stepModelConfig,
          agentTeamConfig:
            acknowledgedDraft.agentTeamConfig && Object.keys(acknowledgedDraft.agentTeamConfig).length > 0
              ? acknowledgedDraft.agentTeamConfig
              : undefined,
          riskConfig: acknowledgedDraft.riskConfig,
          sourceConfig: acknowledgedDraft.sourceConfig,
          marketSessionRules: acknowledgedDraft.marketSessionRules,
          scheduleConfig: acknowledgedDraft.scheduleConfig,
          trailingStopConfig: acknowledgedDraft.trailingStopConfig,
        }),
      }),
    ).then(() => addToast("Live settings saved.", "success"));
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      addToast("Could not copy link.", "error");
    }
  }

  const headerActions = strategy ? (
    <>
      <button
        type="button"
        className="button button-secondary header-action-btn"
        onClick={() => void copyShareLink()}
        title="Copy shareable link"
      >
        <Copy size={15} /> {copiedLink ? "Copied" : "Share"}
      </button>
      <button type="button" className="button button-secondary header-action-btn" onClick={handleToggleStatus}>
        <Power size={15} /> {strategy.status === "ENABLED" ? "Disable" : "Enable"}
      </button>
      <button
        type="button"
        className="button button-primary header-action-btn"
        onClick={handleTrigger}
        disabled={strategy.status !== "ENABLED" || saving}
      >
        <Play size={15} /> Run now
      </button>
      <button
        type="button"
        className="button button-secondary header-action-btn"
        onClick={() => {
          setShowForkModal(true);
          setForkName(`${strategy.name} (copy)`);
          setForkTemplateId(strategy.templateId);
          setForkSourceName(strategy.name);
        }}
      >
        <GitFork size={15} /> Fork
      </button>
      <button type="button" className="button button-danger header-action-btn" onClick={handleDelete}>
        <Trash2 size={15} /> Delete
      </button>
    </>
  ) : null;

  return (
    <DashboardShell
      user={user}
      loading={userLoading || loading}
      title={strategy?.name ?? "Strategy"}
      activeNav="strategies"
      headerActions={headerActions}
      feedbackUi={feedbackUi}
    >
      {errorMessage && (
        <div className="notification-banner critical banner-spacing">
          <div><strong>Error:</strong> {errorMessage}</div>
          <button type="button" onClick={() => setErrorMessage(null)} className="banner-close-btn">×</button>
        </div>
      )}

      {strategy && draft && (
        <div className="strategy-page">
          <nav className="strategy-breadcrumb" aria-label="Breadcrumb">
            <Link href="/strategies">Strategies</Link>
            <ChevronRight size={14} />
            <span className="font-mono">{strategy.id.slice(0, 8)}</span>
          </nav>

          <div className="strategy-page-meta">
            <div className="strategy-page-badges">
              <span className={`badge ${strategy.status === "ENABLED" ? "badge-success" : "badge-warning"}`}>
                {strategy.status}
              </span>
              <span className={`badge ${strategy.executionMode === "LIVE" ? "badge-live" : "badge-paper"}`}>
                {strategy.executionMode}
              </span>
              {brokerLabel && <span className="badge badge-paper">{brokerLabel}</span>}
            </div>
            {strategy.description && <p className="strategy-page-description">{strategy.description}</p>}
          </div>

          <div className="strategy-tab-bar" role="tablist" aria-label="Strategy sections">
            {STRATEGY_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                data-testid={`strategy-tab-${tab.id}`}
                className={`strategy-tab${activeTab === tab.id ? " is-active" : ""}`}
                onClick={() => setTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="strategy-tab-panel">
            {activeTab === "overview" && (
              <div className="strategy-overview-grid" data-testid="strategy-panel-overview">
                <div className="strategy-overview-card">
                  <h3>Watchlist</h3>
                  <p className="font-mono">{strategy.symbols.join(", ") || "None"}</p>
                </div>
                <div className="strategy-overview-card">
                  <h3>Output mode</h3>
                  <p className="font-mono">{strategy.outputMode}</p>
                </div>
                <div className="strategy-overview-card">
                  <h3>Schedule</h3>
                  <p className="font-mono">{getStrategyCron(strategy.scheduleConfig)}</p>
                </div>
                <div className="strategy-overview-card">
                  <h3>Recent runs</h3>
                  <p>{runs.length} recorded</p>
                  <button type="button" className="button button-secondary button-sm" onClick={() => setTab("runs")}>
                    View runs
                  </button>
                </div>
              </div>
            )}

            {activeTab === "agents" && (
              <div className="strategy-agents-panel" data-testid="strategy-panel-agents">
                <div className="strategy-agents-toolbar">
                  <p className="strategy-page-muted">
                    Read-only pipeline view. Open Settings to edit prompts, models, and team structure.
                  </p>
                  <button type="button" className="button button-secondary button-sm" onClick={() => setTab("settings")}>
                    <SquarePen size={14} /> Edit in Settings
                  </button>
                </div>
                <AgentPipelineView
                  teamConfig={strategy.agentTeamConfig}
                  credentials={credentials}
                  canvasClassName="ag-canvas-full"
                  onAgentClick={(agentId) => setTab("settings", agentId)}
                />
              </div>
            )}

            {activeTab === "runs" && (
              <div data-testid="strategy-panel-runs">
                <StrategyRunsList
                  runs={runs}
                  strategyId={strategyId}
                  loading={runsLoading}
                  selectedRunId={selectedRunId}
                  onSelectRun={setSelectedRun}
                  onRefresh={() => void loadRuns()}
                />
              </div>
            )}

            {activeTab === "settings" && (
              <div className="strategy-settings-panel" data-testid="strategy-panel-settings">
                <StrategyConfigForm
                  strategy={draft}
                  credentials={credentials}
                  brokerAccounts={brokerAccounts}
                  initialExpandedAgentId={focusAgentId}
                  onChange={setDraft}
                  addToast={addToast}
                  showConfirm={showConfirm}
                  onSubmit={handleSave}
                />
                <div className="strategy-settings-footer">
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => setDraft(JSON.parse(JSON.stringify(strategy)) as StrategyInstance)}
                  >
                    Reset changes
                  </button>
                  <button type="submit" form="strategy-edit-form" className="button button-primary" disabled={saving}>
                    Save settings
                  </button>
                </div>
              </div>
            )}
          </div>
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

      <LiveAckDialog
        open={showLiveAck}
        onClose={() => setShowLiveAck(false)}
        onConfirm={() => void handleLiveAckConfirm()}
      />
    </DashboardShell>
  );
}
