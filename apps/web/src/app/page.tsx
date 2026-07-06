"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  Bot,
  CreditCard,
  Radio,
  FileText,
  Shield,
  RefreshCw,
  Plus,
  Eye,
  TriangleAlert,
  Sparkles,
  LineChart,
  Menu,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  KeyRound,
  ChevronDown,
  HelpCircle,
  ChevronRight,
  Clock,
  XCircle,
  ExternalLink,
  X,
  RotateCcw,
  Search,
  Users,
} from "lucide-react";
import { getCsrfHeader } from "./csrf-client";
import { AgentsTab } from "./agents/agents-tab";
import { CredentialsForm } from "./credentials/credentials-form";
import { LivePinCard } from "./live-pin-card";
import { AgentRunTrace } from "./agent-run-trace";

// Types matching database schemas
interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface Credential {
  id: string;
  kind: string;
  provider: string;
  label: string;
  createdAt: string;
}

interface BrokerAccount {
  id: string;
  credentialId: string;
  provider: string;
  label: string;
  environment: "PAPER" | "LIVE";
  brokerAccountId: string | null;
  status: "UNTESTED" | "CONNECTED" | "ERROR";
  lastTestedAt: string | null;
}

interface StrategyScheduleConfig {
  cron?: unknown;
}

interface StrategyInstance {
  id: string;
  name: string;
  description: string | null;
  status: "ENABLED" | "DISABLED" | "DELETED";
  watchlistMode: "MANUAL" | "DYNAMIC";
  symbols: string[];
  sourceConfig: any;
  riskConfig: any;
  outputMode: "PROPOSED_ORDERS" | "RANKED_IDEAS";
  executionMode: "PAPER" | "LIVE";
  liveAcknowledgedAt: string | null;
  marketSessionRules: any;
  scheduleConfig: StrategyScheduleConfig | null;
  trailingStopConfig: any | null;
  modelLoggingDepth: "METADATA" | "FULL";
  stepModelConfig: { summarizer?: string; orderGeneration?: string };
  agentTeamConfig: Record<string, unknown>;
  brokerAccountId: string | null;
  templateId: string;
}

interface Notification {
  id: string;
  kind: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  strategyInstanceId: string | null;
}

interface AuditLog {
  id: string;
  actorType: string;
  action: string;
  target: string;
  metadata: any;
  createdAt: string;
}

interface ProposedOrder {
  id: string;
  symbol: string;
  side: "BUY" | "SELL" | "SELL_SHORT" | "BUY_TO_COVER";
  quantity: number;
  orderType: "MARKET" | "LIMIT";
  limitPrice: number | null;
  environment: "PAPER" | "LIVE";
  rationale: string;
  riskResult: any | null;
  status: string;
}

interface ProposedPacket {
  id: string;
  strategyInstanceId: string;
  status: string;
  rationale: string;
  uncertaintyNote: string | null;
  agentRunMetadata: unknown | null;
  createdAt: string;
  strategyInstance: StrategyInstance;
  proposedOrders: ProposedOrder[];
}

interface JobRun {
  id: string;
  jobType: string;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  strategyInstanceId: string | null;
  createdAt: string;
  outputRefs: { skipped?: string; evidenceBundleId?: string; proposedOrderPacketId?: string; executionResult?: string } | null;
  agentRunMetadata?: unknown;
}

// Navigation tab identifiers
type TabId = "overview" | "strategies" | "agents" | "accounts" | "sources" | "history" | "audit" | "settings";
const VALID_TABS: TabId[] = ["overview", "strategies", "agents", "accounts", "sources", "history", "audit", "settings"];

// Collapsible help panel used in Broker Accounts and Settings tabs
function HelpPanel({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="help-panel">
      <button
        type="button"
        className="help-panel-toggle"
        onClick={() => setOpen((p) => !p)}
        aria-expanded={open}
      >
        <HelpCircle size={15} />
        <span>{title}</span>
        <ChevronDown size={14} className={`help-panel-chevron ${open ? "rotated" : ""}`} />
      </button>
      {open && <div className="help-panel-body">{children}</div>}
    </div>
  );
}

// ─── Run Detail Side Panel ────────────────────────────────────────────────────

type RunStatus2 = "RUNNING" | "COMPLETED" | "PARTIAL" | "NEEDS_ACTION" | "SKIPPED" | "FAILED" | "RETRYING";
type Phase2 = "EVIDENCE" | "AGENT" | "RISK" | "EXECUTION";

interface AgentStepItem {
  id: string;
  phase: Phase2;
  stepIndex: number;
  name: string;
  role: string | null;
  agentId: string | null;
  status: "RUNNING" | "COMPLETED" | "PARTIAL" | "FAILED" | "SKIPPED";
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  outputData: unknown;
  errorMessage: string | null;
  metadata: unknown;
}

interface RunDetailData {
  run: {
    id: string;
    jobType: string;
    status: RunStatus2;
    errorCode: string | null;
    errorMessage: string | null;
    startedAt: string;
    finishedAt: string | null;
    durationMs: number | null;
    createdAt: string;
    outputRefs: Record<string, unknown> | null;
    resumedFromJobRunId: string | null;
  };
  strategy: { id: string; name: string; outputMode: string; executionMode: string } | null;
  steps: AgentStepItem[];
  packet: { id: string; status: string; rationale: string; orderCount: number } | null;
  tokenStats: { totalPromptTokens: number; totalCompletionTokens: number; estimatedCostUsd: number | null };
  resumeAvailable: boolean;
  resumeFromStepIndex: number | null;
  legacyTrace: unknown;
}

const RUN_STATUS_LABEL: Record<RunStatus2, string> = {
  RUNNING: "Running", COMPLETED: "Completed", PARTIAL: "Partial",
  NEEDS_ACTION: "Needs Action", SKIPPED: "Skipped", FAILED: "Failed", RETRYING: "Retrying",
};
const PHASE_LABEL2: Record<Phase2, string> = {
  EVIDENCE: "Evidence Collection", AGENT: "Agent Pipeline", RISK: "Risk Validation", EXECUTION: "Execution",
};

function fmtDur(ms: number | null) {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
function fmtTs2(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function PanelStepRow({ step }: { step: AgentStepItem }) {
  const [expanded, setExpanded] = useState(false);
  const hasBody = step.outputData !== null || step.errorMessage;
  const tokens = (step.promptTokens ?? 0) + (step.completionTokens ?? 0);
  return (
    <li
      className={`rd-step${expanded ? " expanded" : ""}`}
      onClick={() => hasBody && setExpanded((v) => !v)}
      style={{ cursor: hasBody ? "pointer" : "default" }}
    >
      <div className="rd-step-row">
        <div className={`rd-step-dot ${step.status.toLowerCase()}`} />
        <span className={`rd-step-name${step.status === "SKIPPED" ? " skipped" : ""}`}>{step.name}</span>
        {step.role && <span className="rd-step-role">{step.role}</span>}
        {tokens > 0 && <span className="rd-step-tokens">{tokens >= 1000 ? `${(tokens/1000).toFixed(1)}k tok` : `${tokens} tok`}</span>}
        <span className="rd-step-duration">{fmtDur(step.durationMs)}</span>
        {hasBody && (expanded ? <ChevronDown size={12} style={{ color: "var(--faint)", flexShrink: 0 }} /> : <ChevronRight size={12} style={{ color: "var(--faint)", flexShrink: 0 }} />)}
      </div>
      {expanded && hasBody && (
        <div className="rd-step-body">
          {step.errorMessage && (<><div className="rd-step-body-label">Error</div><div className="rd-step-error">{step.errorMessage}</div></>)}
          {step.outputData !== null && (<><div className="rd-step-body-label" style={{ marginTop: step.errorMessage ? "var(--space-3)" : 0 }}>Output</div><pre>{JSON.stringify(step.outputData, null, 2)}</pre></>)}
        </div>
      )}
    </li>
  );
}

function PanelPhaseSection({ phase, steps }: { phase: Phase2; steps: AgentStepItem[] }) {
  const status = steps.length === 0 ? "SKIPPED"
    : steps.some(s => s.status === "RUNNING") ? "RUNNING"
    : steps.some(s => s.status === "FAILED") ? "FAILED"
    : steps.every(s => s.status === "COMPLETED") ? "COMPLETED"
    : steps.some(s => s.status === "PARTIAL") ? "PARTIAL"
    : steps.every(s => s.status === "SKIPPED") ? "SKIPPED" : "PARTIAL";
  const dur = steps.map(s => s.durationMs).filter((d): d is number => d !== null).reduce((a, b) => a + b, 0) || null;
  return (
    <div className="rd-phase-section">
      <div className="rd-phase-header">
        <div className={`rd-phase-dot ${steps.length === 0 ? "empty" : status.toLowerCase()}`} />
        <span className="rd-phase-name">{PHASE_LABEL2[phase]}</span>
        {dur !== null && <span className="rd-phase-duration">{fmtDur(dur)}</span>}
      </div>
      {steps.length === 0 ? (
        <div className="rd-phase-empty">No steps recorded</div>
      ) : (
        <ul className="rd-step-list">{steps.map(s => <PanelStepRow key={s.id} step={s} />)}</ul>
      )}
    </div>
  );
}

function RunDetailSidePanel({ runId, onClose }: { runId: string; onClose: () => void }) {
  const [data, setData] = useState<RunDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/runs/${runId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? "Failed to load run.");
      }
      setData(await res.json() as RunDetailData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!data) return;
    if (data.run.status !== "RUNNING" && data.run.status !== "RETRYING") return;
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [data, load]);

  useEffect(() => {
    const prev = window.location.hash;
    window.history.pushState(null, "", `#run-${runId}`);
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      if (window.location.hash === `#run-${runId}`) {
        window.history.pushState(null, "", prev || window.location.pathname);
      }
    };
  }, [runId, onClose]);

  async function handleRetry() {
    if (!data) return;
    setRetrying(true);
    try {
      const csrfRes = await fetch("/api/auth/csrf-token");
      const { csrfToken } = await csrfRes.json() as { csrfToken: string };
      const res = await fetch(`/api/runs/${runId}/retry`, {
        method: "POST",
        headers: { "x-csrf-token": csrfToken, "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? "Retry failed.");
      }
      onClose();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Retry failed.");
    } finally {
      setRetrying(false);
    }
  }

  const phaseMap: Record<Phase2, AgentStepItem[]> = { EVIDENCE: [], AGENT: [], RISK: [], EXECUTION: [] };
  if (data) { for (const s of data.steps) phaseMap[s.phase].push(s); }

  return (
    <>
      <div className="run-side-panel-backdrop" onClick={onClose} />
      <div className="run-side-panel" role="dialog" aria-modal="true" aria-label="Run detail">
        <div className="run-side-panel-header">
          <div className="run-side-panel-title">
            {data?.strategy && <div className="rd-strategy-name">{data.strategy.name}</div>}
            <h2>Run Detail</h2>
            <div className="rd-run-id">{runId}</div>
          </div>
          <div className="run-side-panel-header-actions">
            {data && (
              <span className={`rd-status-badge ${data.run.status.toLowerCase().replace("_", "_")}`}>
                {RUN_STATUS_LABEL[data.run.status]}
              </span>
            )}
            <a href={`/runs/${runId}`} target="_blank" rel="noopener noreferrer" className="run-panel-open-link" title="Open full page">
              <ExternalLink size={13} /> Full Page
            </a>
            <button
              type="button"
              onClick={() => void load()}
              className="btn-ghost"
              title="Refresh"
              style={{ padding: "4px 6px" }}
            >
              <RefreshCw size={14} />
            </button>
            <button type="button" onClick={onClose} className="modal-close-btn" aria-label="Close panel">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="run-side-panel-body">
          {loading && <div style={{ color: "var(--muted)", fontSize: "0.85rem", paddingTop: "var(--space-4)" }}>Loading run…</div>}
          {error && <div className="rd-error-banner">{error}</div>}
          {data && (() => {
            const { run, steps, packet, tokenStats, resumeAvailable, legacyTrace } = data;
            const executionResult = run.outputRefs?.executionResult as string | undefined;
            return (
              <>
                <div className="rd-meta-row">
                  <div className="rd-meta-item"><span className="rd-meta-label">Started</span><span className="rd-meta-value">{fmtTs2(run.startedAt)}</span></div>
                  {run.finishedAt && <div className="rd-meta-item"><span className="rd-meta-label">Finished</span><span className="rd-meta-value">{fmtTs2(run.finishedAt)}</span></div>}
                  <div className="rd-meta-item"><span className="rd-meta-label">Duration</span><span className="rd-meta-value">{fmtDur(run.durationMs)}</span></div>
                  {executionResult && <div className="rd-meta-item"><span className="rd-meta-label">Result</span><span className="rd-meta-value">{executionResult}</span></div>}
                </div>

                {run.errorMessage && (
                  <div className="rd-error-banner">
                    {run.errorCode && <div className="rd-error-code">{run.errorCode}</div>}
                    {run.errorMessage}
                  </div>
                )}

                {(["EVIDENCE", "AGENT", "RISK", "EXECUTION"] as Phase2[]).map(phase => (
                  <PanelPhaseSection key={phase} phase={phase} steps={phaseMap[phase]} />
                ))}

                {legacyTrace !== null && legacyTrace !== undefined && (
                  <div className="rd-legacy-trace">
                    <div className="rd-legacy-trace-label">Agent Run Trace (Legacy)</div>
                    <pre>{JSON.stringify(legacyTrace, null, 2)}</pre>
                  </div>
                )}

                <div className="rd-footer">
                  <div className="rd-footer-stats">
                    {tokenStats.totalPromptTokens > 0 && (
                      <div className="rd-meta-item">
                        <span className="rd-meta-label">Total Tokens</span>
                        <span className="rd-meta-value">{(tokenStats.totalPromptTokens + tokenStats.totalCompletionTokens).toLocaleString()}</span>
                      </div>
                    )}
                    {tokenStats.estimatedCostUsd !== null && (
                      <div className="rd-meta-item">
                        <span className="rd-meta-label">Est. Cost</span>
                        <span className="rd-meta-value">${tokenStats.estimatedCostUsd.toFixed(4)}</span>
                      </div>
                    )}
                    {packet && (
                      <div className="rd-meta-item">
                        <span className="rd-meta-label">Packet</span>
                        <span className="rd-meta-value">{packet.status} · {packet.orderCount} order{packet.orderCount !== 1 ? "s" : ""}</span>
                      </div>
                    )}
                  </div>
                  {(run.status === "FAILED" || run.status === "PARTIAL") && (
                    <button className="btn-primary" onClick={() => void handleRetry()} disabled={retrying}>
                      <RotateCcw size={14} /> {retrying ? "Retrying…" : resumeAvailable ? "Resume from Failure" : "Re-run"}
                    </button>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      </div>
    </>
  );
}

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [brokerAccounts, setBrokerAccounts] = useState<BrokerAccount[]>([]);
  const [strategies, setStrategies] = useState<StrategyInstance[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [packets, setPackets] = useState<ProposedPacket[]>([]);
  const [jobRuns, setJobRuns] = useState<JobRun[]>([]);
  
  // UI states
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Onboarding wizard
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Run side panel
  const [runPanelId, setRunPanelId] = useState<string | null>(null);

  // Audit log filter
  const [auditFilter, setAuditFilter] = useState("");

  // Open run panel from URL hash on mount
  useEffect(() => {
    const hash = window.location.hash;
    const match = hash.match(/^#run-(.+)$/);
    if (match?.[1]) setRunPanelId(match[1]);
  }, []);

  // Modals & Panels
  const [reviewPacket, setReviewPacket] = useState<ProposedPacket | null>(null);
  const [showConnectAccountModal, setShowConnectAccountModal] = useState(false);
  const [auditMetadataModal, setAuditMetadataModal] = useState<unknown | null>(null);
  const auditMetadataDialogRef = useRef<HTMLDialogElement>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    onConfirm: (promptValue?: string) => void;
    danger?: boolean;
    confirmLabel?: string;
    promptLabel?: string;
  } | null>(null);
  const [confirmPromptValue, setConfirmPromptValue] = useState("");
  interface Toast {
    id: string;
    type: "success" | "error" | "info" | "warning";
    message: string;
  }
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Add refs for each native <dialog> modal and full-area editor.
  const connectDialogRef = useRef<HTMLDialogElement>(null);
  const reviewDialogRef = useRef<HTMLDialogElement>(null);
  const confirmDialogRef = useRef<HTMLDialogElement>(null);

  // Theme: read the value the pre-paint script applied, then let the user toggle.
  useEffect(() => {
    const current = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    setTheme(current);
  }, []);

  // Sidebar: restore the user's collapsed/expanded preference on mount.
  useEffect(() => {
    try {
      setSidebarCollapsed(localStorage.getItem("pasa-sidebar") === "collapsed");
    } catch {
      // ignore storage errors (private mode, etc.)
    }
  }, []);

  // Hash-based routing — persist active tab in URL so refresh lands on same page.
  const navigateTo = useCallback((tab: TabId) => {
    setActiveTab(tab);
    setIsMobileMenuOpen(false);
    window.location.hash = tab;
  }, []);

  useEffect(() => {
    const readHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (hash === "strategies") {
        window.location.replace("/strategies");
        return;
      }
      if (VALID_TABS.includes(hash as TabId)) setActiveTab(hash as TabId);
    };
    readHash();
    window.addEventListener("hashchange", readHash);
    return () => window.removeEventListener("hashchange", readHash);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("pasa-theme", next);
    } catch {
      // ignore storage errors (private mode, etc.)
    }
  };

  const toggleSidebar = () => {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    try {
      localStorage.setItem("pasa-sidebar", next ? "collapsed" : "expanded");
    } catch {
      // ignore storage errors (private mode, etc.)
    }
  };

  // Synchronize state flags and open/close native dialogs using refs
  useEffect(() => {
    const dialog = connectDialogRef.current;
    if (!dialog) return;
    if (showConnectAccountModal) {
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
    }
  }, [showConnectAccountModal]);

  useEffect(() => {
    const dialog = reviewDialogRef.current;
    if (!dialog) return;
    if (reviewPacket) {
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
    }
  }, [reviewPacket]);

  useEffect(() => {
    const dialog = auditMetadataDialogRef.current;
    if (!dialog) return;
    if (auditMetadataModal !== null) {
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
    }
  }, [auditMetadataModal]);

  useEffect(() => {
    const dialog = confirmDialogRef.current;
    if (!dialog) return;
    if (confirmDialog) {
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
    }
  }, [confirmDialog]);

  const addToast = (message: string, type: Toast["type"] = "info") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  };

  const showConfirm = (message: string, onConfirm: (promptValue?: string) => void, options?: { title?: string; danger?: boolean; confirmLabel?: string; promptLabel?: string }) => {
    setConfirmPromptValue("");
    setConfirmDialog({
      title: options?.title || "Are you sure?",
      message,
      onConfirm,
      danger: options?.danger ?? false,
      ...(options?.confirmLabel !== undefined && { confirmLabel: options.confirmLabel }),
      ...(options?.promptLabel !== undefined && { promptLabel: options.promptLabel }),
    });
  };

  // Form states
  const [connectCredId, setConnectCredId] = useState("");
  const [connectLabel, setConnectLabel] = useState("");
  const [connectEnv, setConnectEnv] = useState<"PAPER" | "LIVE">("PAPER");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      // 1. Fetch user
      const meRes = await fetch("/api/auth/me");
      const meData = await meRes.json();
      if (!meData.user) {
        window.location.href = "/sign-in";
        return;
      }
      setUser(meData.user);

      // 2. Fetch list of credentials
      const credsRes = await fetch("/api/credentials");
      const credsData = await credsRes.json();
      setCredentials(credsData.credentials || []);

      // 3. Fetch broker accounts
      const accountsRes = await fetch("/api/broker-accounts");
      const accountsData = await accountsRes.json();
      setBrokerAccounts(accountsData.brokerAccounts || []);

      // 4. Fetch strategies
      const strategiesRes = await fetch("/api/strategy-instances");
      const strategiesData = await strategiesRes.json();
      setStrategies(strategiesData.instances || []);

      // 6. Fetch notifications
      const notificationsRes = await fetch("/api/notifications");
      const notificationsData = await notificationsRes.json();
      setNotifications(notificationsData.notifications || []);

      // 7. Fetch audit logs (admin only)
      if (meData.user.role === "ADMIN") {
        const auditRes = await fetch("/api/audit-logs?limit=30");
        const auditData = await auditRes.json();
        setAuditLogs(auditData.entries || []);
      }

      // 8. Fetch proposed packets
      const packetsRes = await fetch("/api/proposed-packets?limit=30");
      const packetsData = await packetsRes.json();
      setPackets(packetsData.packets || []);

      // 9. Fetch recent job runs
      const runsRes = await fetch("/api/job-runs?limit=20");
      const runsData = await runsRes.json();
      setJobRuns(runsData.runs || []);

      // Check onboarding need
      if (credsData.credentials?.length === 0 || accountsData.brokerAccounts?.length === 0) {
        setShowOnboarding(true);
      } else {
        setShowOnboarding(false);
      }
    } catch (err) {
      setErrorMessage("Failed to load dashboard data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (actionName: string, apiCall: () => Promise<Response>) => {
    setActionLoading(actionName);
    setErrorMessage(null);
    try {
      const res = await apiCall();
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || `HTTP error ${res.status}`);
      }
      await fetchData();
      return data;
    } catch (err: any) {
      setErrorMessage(err.message || "Action failed.");
      throw err;
    } finally {
      setActionLoading(null);
    }
  };

  const markNotificationRead = (id: string) => {
    handleAction(`read-notification-${id}`, () =>
      fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getCsrfHeader() },
        body: JSON.stringify({ notificationIds: [id] }),
      })
    );
  };

  const markAllNotificationsRead = () => {
    handleAction("read-all-notifications", () =>
      fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getCsrfHeader() },
        body: JSON.stringify({ markAll: true }),
      })
    );
  };

  const handleConnectBrokerAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!connectCredId || !connectLabel) return;

    const testAndConnect = async () => {
      const testRes = await fetch("/api/broker-accounts/test", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getCsrfHeader() },
        body: JSON.stringify({
          credentialId: connectCredId,
          environment: connectEnv,
        }),
      });
      const testData = (await testRes.json()) as { ok?: boolean; message?: string };
      if (!testRes.ok || !testData.ok) {
        throw new Error(testData.message || "Alpaca connection test failed.");
      }

      await handleAction("connect-account", () =>
        fetch("/api/broker-accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getCsrfHeader() },
          body: JSON.stringify({
            credentialId: connectCredId,
            label: connectLabel,
            environment: connectEnv,
          }),
        })
      );
    };

    testAndConnect()
      .then(() => {
        setShowConnectAccountModal(false);
        setConnectCredId("");
        setConnectLabel("");
        setConnectEnv("PAPER");
        addToast("Broker connection verified and account connected.", "success");
      })
      .catch((err) => {
        addToast(err.message || "Failed to connect Alpaca account.", "error");
      });
  };

  const handleTestBrokerConnection = (credentialId: string, environment: string) => {
    handleAction(`test-connection-${credentialId}`, () =>
      fetch("/api/broker-accounts/test", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getCsrfHeader() },
        body: JSON.stringify({ credentialId, environment }),
      })
    ).then((data) => {
      if (data.ok) {
        addToast("Connection successful!", "success");
      } else {
        const errorMsg = data.message || "Connection failed.";
        addToast(
          errorMsg.toLowerCase() === "unauthorized"
            ? "Connection failed: Unauthorized. Please verify your Alpaca Key ID, Secret Key, and Environment (Paper keys do not work in Live mode)."
            : `Connection failed: ${errorMsg}`,
          "error"
        );
      }
    }).catch((err) => {
      addToast(err.message || "An error occurred during connection test.", "error");
    });
  };

  const handleRefreshBrokerAccount = (id: string) => {
    handleAction(`refresh-account-${id}`, () =>
      fetch(`/api/broker-accounts/${id}/refresh`, {
        method: "POST",
        headers: { ...getCsrfHeader() },
      })
    );
  };

  const handleDeleteBrokerAccount = (id: string, label: string) => {
    showConfirm(
      `Delete broker account "${label}"? This cannot be undone.`,
      () => {
        handleAction(`delete-account-${id}`, () =>
          fetch(`/api/broker-accounts/${id}`, {
            method: "DELETE",
            headers: { ...getCsrfHeader() },
          })
        ).then(() => {
          addToast("Broker account disconnected successfully.", "success");
        });
      },
      { title: "Delete Broker Account", danger: true }
    );
  };

  const handleExecutePacket = (packetId: string, isLive = false) => {
    const submit = (livePin?: string) => {
      handleAction(`execute-packet-${packetId}`, () =>
        fetch(`/api/proposed-packets/${packetId}/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getCsrfHeader() },
          ...(isLive ? { body: JSON.stringify({ livePin: livePin ?? "" }) } : {}),
        })
      ).then(() => {
        setReviewPacket(null);
        setPackets((prev) => prev.map((p) => p.id === packetId ? { ...p, status: "EXECUTED" } : p));
        addToast("Orders submitted to broker execution flow.", "success");
      });
    };

    if (isLive) {
      showConfirm(
        "These orders will be executed with REAL MONEY. Enter your Live Access PIN to confirm.",
        (pin) => submit(pin),
        {
          title: "Execute LIVE Orders",
          danger: true,
          confirmLabel: "Execute LIVE",
          promptLabel: "Live Access PIN",
        }
      );
      return;
    }

    showConfirm(
      "Are you sure you want to approve and execute these proposed orders?",
      () => submit(),
      { title: "Execute Proposed Orders" }
    );
  };

  const handleRejectPacket = (packetId: string) => {
    showConfirm(
      "Reject this proposal? The AI rationale and orders will be preserved in history but no orders will be submitted.",
      () => {
        handleAction(`reject-packet-${packetId}`, () =>
          fetch(`/api/proposed-packets/${packetId}/reject`, {
            method: "POST",
            headers: { ...getCsrfHeader() },
          })
        ).then(() => {
          setReviewPacket(null);
          setPackets((prev) => prev.map((p) => p.id === packetId ? { ...p, status: "REJECTED" } : p));
          addToast("Proposal rejected.", "info");
        });
      },
      { title: "Reject Proposal" }
    );
  };

  if (loading) {
    return (
      <div className="dashboard-loading-container">
        <div className="dashboard-loading-content">
          <div className="eyebrow animated-pulse">Loading Pasa Trader Platform...</div>
        </div>
      </div>
    );
  }

  const activeBroker = brokerAccounts[0];

  return (
    <div className={`dashboard-container ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      {isMobileMenuOpen && <div className="sidebar-overlay" onClick={() => setIsMobileMenuOpen(false)} />}
      {/* ─── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className={`dashboard-sidebar ${isMobileMenuOpen ? "open" : ""}`}>
        <div className="sidebar-header-mobile">
          <h2 className="sidebar-title">
            <span className="sidebar-logo-icon"><LineChart size={14} strokeWidth={2.4} /></span> <span className="sidebar-brand-text">Pasa Trader</span>
          </h2>
          <button
            onClick={toggleSidebar}
            className="sidebar-collapse-toggle"
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
          <button onClick={() => setIsMobileMenuOpen(false)} className="mobile-menu-close">
            ×
          </button>
        </div>

        <nav className="sidebar-nav">
          <button onClick={() => navigateTo("overview")} className={`nav-button ${activeTab === "overview" ? "active" : ""}`} title="Dashboard">
            <LayoutDashboard /> <span className="nav-label">Dashboard</span>
          </button>
          <Link href="/strategies" className="nav-button" title="Strategies">
            <Bot /> <span className="nav-label">Strategies</span>
          </Link>
          <button onClick={() => navigateTo("agents")} className={`nav-button ${activeTab === "agents" ? "active" : ""}`} title="Agents">
            <Users /> <span className="nav-label">Agents</span>
          </button>
          <button onClick={() => navigateTo("accounts")} className={`nav-button ${activeTab === "accounts" ? "active" : ""}`} title="Broker Accounts">
            <CreditCard /> <span className="nav-label">Broker Accounts</span>
          </button>
          <button onClick={() => navigateTo("sources")} className={`nav-button ${activeTab === "sources" ? "active" : ""}`} title="Data Sources">
            <Radio /> <span className="nav-label">Data Sources</span>
          </button>
          <button onClick={() => navigateTo("history")} className={`nav-button ${activeTab === "history" ? "active" : ""}`} title="Proposals">
            <FileText /> <span className="nav-label">Proposals</span>
          </button>
          {user?.role === "ADMIN" && (
            <button onClick={() => navigateTo("audit")} className={`nav-button ${activeTab === "audit" ? "active" : ""}`} title="Audit Logs">
              <Shield /> <span className="nav-label">Audit Logs</span>
            </button>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user-info">
            <strong>{user?.name}</strong>
            <div className="sidebar-user-email">{user?.email}</div>
          </div>
          <button
            onClick={toggleTheme}
            className="secondary-button theme-toggle"
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          >
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            <span className="btn-label">{theme === "dark" ? "Light mode" : "Dark mode"}</span>
          </button>
          <button
            type="button"
            onClick={() => navigateTo("settings")}
            className="secondary-button sidebar-link-btn"
            title="Settings"
          >
            <KeyRound size={15} /> <span className="btn-label">Settings</span>
          </button>
          <form action="/api/auth/logout" method="POST" className="display-contents">
            <button type="submit" className="secondary-button sidebar-signout-btn" title="Sign Out">
              <LogOut size={15} /> <span className="btn-label">Sign Out</span>
            </button>
          </form>
        </div>
      </aside>

      {/* ─── Main Content ─────────────────────────────────────────────────── */}
      <main className="dashboard-main">
        <div className="mobile-header">
          <button onClick={() => setIsMobileMenuOpen(true)} className="mobile-menu-trigger" style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
            <Menu size={16} /> Menu
          </button>
          <div className="mobile-brand-logo">
            <span className="sidebar-logo-icon"><LineChart size={14} strokeWidth={2.4} /></span> Pasa Trader
          </div>
        </div>
        {/* Error message banner */}
        {errorMessage && (
          <div className="notification-banner critical banner-spacing">
            <div>
              <strong>Action Failed:</strong> {errorMessage}
            </div>
            <button onClick={() => setErrorMessage(null)} className="banner-close-btn">×</button>
          </div>
        )}
        {/* Success message banner */}
        {successMessage && (
          <div className="notification-banner success banner-spacing">
            <div>{successMessage}</div>
            <button onClick={() => setSuccessMessage(null)} className="banner-close-btn">×</button>
          </div>
        )}

        <header className="dashboard-header">
          <h1 className="dashboard-title">
            {activeTab === "overview" && "Dashboard Overview"}
            {activeTab === "agents" && "Agents"}
            {activeTab === "accounts" && "Broker Connections"}
            {activeTab === "sources" && "Evidence Connectors"}
            {activeTab === "history" && "Proposed Orders & Packets"}
            {activeTab === "audit" && "System Audit Logs"}
            {activeTab === "settings" && "Settings"}
          </h1>
          
          <div className="dashboard-header-actions">
            {activeTab === "accounts" && (
              <button onClick={() => setShowConnectAccountModal(true)} className="button button-primary header-action-btn">
                <Plus size={15} /> Connect Account
              </button>
            )}
          </div>
        </header>

        {/* ─── TAB: OVERVIEW ──────────────────────────────────────────────── */}
        {activeTab === "overview" && (
          <div>
            {/* Quick Metrics Widget */}
            <div className="widget-grid">
              <div className="glass-card glass-card-flex-col">
                <div>
                  <small className="eyebrow">Brokerage Environment</small>
                  <h3 className="metric-title-medium">
                    {activeBroker ? activeBroker.label : "No Account Connected"}
                  </h3>
                </div>
                <div>
                  {activeBroker ? (
                    <span className={`badge ${activeBroker.environment === "LIVE" ? "badge-live" : "badge-paper"}`}>
                      {activeBroker.environment} Trading
                    </span>
                  ) : (
                    <span className="badge badge-warning">Not Connected</span>
                  )}
                </div>
              </div>

              <div className="glass-card">
                <small className="eyebrow">Active Automations</small>
                <h3 className="metric-title-large">
                  {strategies.filter(s => s.status === "ENABLED").length}
                </h3>
                <span className="metric-label">
                  Out of {strategies.length} total strategy instances.
                </span>
              </div>

              <div className="glass-card">
                <small className="eyebrow">Unread Alerts</small>
                <h3 className={`metric-title-large ${notifications.filter(n => !n.read && n.severity === "CRITICAL").length > 0 ? "text-error" : ""}`}>
                  {notifications.filter(n => !n.read).length}
                </h3>
                <span className="metric-label">
                  {notifications.filter(n => !n.read && n.severity === "CRITICAL").length} critical system issues.
                </span>
              </div>
            </div>

            {strategies.filter((s) => s.status !== "DELETED").length > 0 && (
              <div className="glass-card" data-testid="overview-strategy-quick-links">
                <div className="card-header">
                  <h2 className="card-title" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <LineChart size={18} style={{ color: "var(--accent)" }} /> Your Strategies
                  </h2>
                  <Link href="/strategies" className="button button-secondary button-sm">
                    View all <ChevronRight size={14} />
                  </Link>
                </div>
                <div className="overview-strategy-grid">
                  {strategies
                    .filter((s) => s.status !== "DELETED")
                    .slice(0, 6)
                    .map((strategy) => (
                      <article key={strategy.id} className="overview-strategy-card">
                        <div className="overview-strategy-card-header">
                          <Link href={`/strategies/${strategy.id}`} className="overview-strategy-name">
                            {strategy.name}
                          </Link>
                          <span className={`badge ${strategy.status === "ENABLED" ? "badge-success" : "badge-warning"}`}>
                            {strategy.status}
                          </span>
                        </div>
                        <div className="overview-strategy-links">
                          <Link href={`/strategies/${strategy.id}?tab=agents`}>Agent Graph</Link>
                          <Link href={`/strategies/${strategy.id}?tab=runs`}>Runs</Link>
                          <Link href={`/strategies/${strategy.id}?tab=settings`}>Settings</Link>
                        </div>
                      </article>
                    ))}
                </div>
              </div>
            )}

            {/* Notifications and Outages */}
            {notifications.filter(n => !n.read).length > 0 && (
              <div className="glass-card glass-card-pb-md">
                <div className="card-header">
                  <h2 className="card-title" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}><TriangleAlert size={18} style={{ color: "var(--warn)" }} /> System Notifications &amp; Outages</h2>
                  <button onClick={markAllNotificationsRead} className="button button-secondary button-sm">
                    Mark all read
                  </button>
                </div>
                <div className="grid-gap-sm">
                  {notifications.filter(n => !n.read).map((n) => (
                    <div key={n.id} className={`notification-banner ${n.severity.toLowerCase()}`}>
                      <div className="flex-1">
                        <div className="font-extra-bold">{n.title}</div>
                        <div className="notification-message">{n.message}</div>
                      </div>
                      <button onClick={() => markNotificationRead(n.id)} className="button button-secondary button-sm">
                        Dismiss
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Draft proposed order packets requiring manual review */}
            <div className="glass-card">
              <h2 className="card-title-mb-md" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}><Eye size={18} style={{ color: "var(--accent)" }} /> Pending Proposed Order Review</h2>
              {packets.filter(p => p.status === "DRAFT" || p.status === "PENDING_REVIEW").length === 0 ? (
                <p className="card-description">No proposed order packets are waiting for review. Automated trades will execute automatically on schedule.</p>
              ) : (
                <div className="grid-gap-md">
                  {packets.filter(p => p.status === "DRAFT" || p.status === "PENDING_REVIEW").map((p) => (
                    <article key={p.id} className="pending-packet-item">
                      <div>
                        <div className="flex-align-center-gap-sm">
                          <strong>{p.strategyInstance.name}</strong>
                          <span className={`badge ${p.strategyInstance.executionMode === "LIVE" ? "badge-live" : "badge-paper"}`}>
                            {p.strategyInstance.executionMode}
                          </span>
                        </div>
                        <p className="packet-details">
                          {p.proposedOrders.length} proposed order(s) generated at {new Date(p.createdAt).toLocaleString()}.
                        </p>
                      </div>
                      <button onClick={() => setReviewPacket(p)} className="button button-primary button-sm">
                        Review & Execute
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </div>

            {/* Onboarding Overlay */}
            {showOnboarding && (
              <div className="glass-card onboarding-banner">
                <h2 className="onboarding-title" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}><Sparkles size={18} style={{ color: "var(--accent)" }} /> Welcome to Pasa Trader Onboarding</h2>
                <p className="onboarding-intro">To get started with your self-hosted automated trading workspace, follow these simple setup steps:</p>
                <ol className="onboarding-list">
                  <li>
                    <strong>Add model provider and broker credentials</strong> in the{" "}
                    <button
                      type="button"
                      className="onboarding-link inline-link-button"
                      onClick={() => {
                        setActiveTab("settings");
                        setShowOnboarding(false);
                      }}
                    >
                      Settings
                    </button>
                    {" "}tab.
                  </li>
                  <li>
                    <strong>Connect your broker account</strong> from the Broker Accounts tab in the sidebar.
                  </li>
                  <li>
                    <strong>Fork a base strategy template</strong> from the{" "}
                    <Link href="/strategies" className="onboarding-link">Strategies</Link> page.
                  </li>
                </ol>
                <button onClick={() => setShowOnboarding(false)} className="button button-secondary">
                  Dismiss Guide
                </button>
              </div>
            )}
          </div>
        )}

        {/* ─── TAB: AGENTS ────────────────────────────────────────────────── */}
        {activeTab === "agents" && (
          <AgentsTab
            onMessage={(message, type) => {
              if (type === "error") setErrorMessage(message);
              else setSuccessMessage(message);
            }}
          />
        )}

        {/* ─── TAB: BROKER ACCOUNTS ────────────────────────────────────────── */}
        {activeTab === "accounts" && (
          <div className="grid-gap-lg">
            {/* Help panel for connecting brokers */}
            <HelpPanel title="How to Connect a Broker Account">
              <ol className="help-list">
                <li>For Alpaca, get API keys from <a href="https://app.alpaca.markets" target="_blank" rel="noopener noreferrer" className="help-link">app.alpaca.markets</a> and match paper keys to PAPER or live keys to LIVE.</li>
                <li>For Interactive Brokers, run and authenticate the Client Portal Gateway, then save an IBKR broker credential with the gateway URL and account IDs.</li>
                <li>Go to <strong>Settings - Credential Vault</strong> and add a new <strong>BROKER</strong> credential.</li>
                <li>Return here and click <strong>Connect Account</strong>, select your credential, and set the environment to match (Paper or Live).</li>
              </ol>
              <p className="help-note">Paper credentials must only be connected to PAPER. LIVE always requires explicit acknowledgment before execution.</p>
            </HelpPanel>

            {brokerAccounts.length === 0 ? (
              <div className="glass-card glass-card-empty">
                <p className="empty-text">No broker accounts connected. Connect a supported broker account to begin.</p>
                <button onClick={() => setShowConnectAccountModal(true)} className="button button-primary">
                  <Plus size={15} /> Connect Broker Account
                </button>
              </div>
            ) : (
              <>
                {brokerAccounts.map((acc) => (
                  <div key={acc.id} className="glass-card">
                    <div className="flex-between-align-center">
                      <div>
                        <div className="flex-align-center-gap-md">
                          <h3 className="card-title">{acc.label}</h3>
                          <span className={`badge ${acc.environment === "LIVE" ? "badge-live" : "badge-paper"}`}>
                            {acc.environment}
                          </span>
                          <span className={`badge ${acc.status === "CONNECTED" ? "badge-success" : "badge-error"}`}>
                            {acc.status}
                          </span>
                        </div>
                        <div className="broker-account-details">
                          <div><strong>Provider:</strong> {acc.provider}</div>
                          <div><strong>Account ID:</strong> {acc.brokerAccountId || "Unknown"}</div>
                          <div><strong>Last tested:</strong> {acc.lastTestedAt ? new Date(acc.lastTestedAt).toLocaleString() : "Never"}</div>
                        </div>
                      </div>

                      <div className="broker-account-actions">
                        <button onClick={() => handleTestBrokerConnection(acc.credentialId, acc.environment)} className="button button-secondary button-sm">
                          Test Connection
                        </button>
                        <button onClick={() => handleRefreshBrokerAccount(acc.id)} className="button button-primary button-sm">
                          Refresh Status
                        </button>
                        <button onClick={() => handleDeleteBrokerAccount(acc.id, acc.label)} className="button button-danger button-sm">
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                <button onClick={() => setShowConnectAccountModal(true)} className="button button-secondary">
                  <Plus size={15} /> Connect Another Account
                </button>
              </>
            )}
          </div>
        )}

        {/* ─── TAB: DATA SOURCES ──────────────────────────────────────────── */}
        {activeTab === "sources" && (
          <div className="glass-card">
            <h2 className="card-title-mb-md icon-heading"><Radio size={18} /> Approved Source Connectors</h2>
            <p className="connector-subtitle">
              Pasa Trader strictly scraping allowlisted endpoints to generate trade evidence.
            </p>
            <div className="table-container"><table className="premium-table">
              <thead>
                <tr>
                  <th>Connector Name</th>
                  <th>Source Domain</th>
                  <th>Reliability Class</th>
                  <th>Freshness</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Alpaca Market Data</strong></td>
                  <td>data.alpaca.markets</td>
                  <td><span className="badge badge-success">Official API</span></td>
                  <td><span className="badge badge-success">fresh</span></td>
                </tr>
                <tr>
                  <td><strong>SEC EDGAR Filing RSS</strong></td>
                  <td>sec.gov/edgar</td>
                  <td><span className="badge badge-success">Official API</span></td>
                  <td><span className="badge badge-success">fresh</span></td>
                </tr>
                <tr>
                  <td><strong>SEC Form 4 Insider Trades</strong></td>
                  <td>sec.gov/Form4</td>
                  <td><span className="badge badge-success">Official API</span></td>
                  <td><span className="badge badge-success">fresh</span></td>
                </tr>
                <tr>
                  <td><strong>SEC 13F Hedge Fund Filings</strong></td>
                  <td>sec.gov/13F</td>
                  <td><span className="badge badge-success">Official API</span></td>
                  <td><span className="badge badge-warning">Delayed (Institutional reporting lag)</span></td>
                </tr>
                <tr>
                  <td><strong>Senate Politician Stock Watcher</strong></td>
                  <td>github.com/senate-stock-watcher</td>
                  <td><span className="badge badge-warning">Best-Effort Scrape</span></td>
                  <td><span className="badge badge-warning">best effort (Delayed)</span></td>
                </tr>
              </tbody>
            </table></div>
          </div>
        )}

        {/* ─── TAB: PROPOSAL HISTORY ──────────────────────────────────────── */}
        {activeTab === "history" && (() => {
          const pendingPackets = packets.filter((p) => p.status === "DRAFT" || p.status === "PENDING_REVIEW");
          const historyPackets = packets.filter((p) => p.status !== "DRAFT" && p.status !== "PENDING_REVIEW");
          return (
            <div className="grid-gap-lg">

              {/* Zone A: Awaiting Decision */}
              <div className="glass-card">
                <div className="ph-section-header">
                  <h2 className="card-title icon-heading"><Clock size={16} /> Awaiting Decision</h2>
                  {pendingPackets.length > 0 && (
                    <span className="badge badge-warning">{pendingPackets.length} pending</span>
                  )}
                </div>
                {pendingPackets.length === 0 ? (
                  <p className="card-description">No proposals waiting for review. Run a strategy to generate new proposals.</p>
                ) : (
                  <div className="grid-gap-md">
                    {pendingPackets.map((p) => {
                      const isResearch = p.strategyInstance.outputMode === "RANKED_IDEAS" || p.proposedOrders.length === 0;
                      const hardBlocked = p.proposedOrders.some((o) => o.riskResult?.status === "hard_block");
                      const riskWarnings = p.proposedOrders.filter((o) => o.riskResult?.status === "warning").length;
                      return (
                        <article key={p.id} className="ph-pending-card">
                          <div className="ph-pending-header">
                            <div className="ph-pending-meta">
                              <strong className="ph-strategy-name">{p.strategyInstance.name}</strong>
                              <div className="ph-badges">
                                <span className={`badge ${p.strategyInstance.executionMode === "LIVE" ? "badge-live" : "badge-paper"}`}>
                                  {p.strategyInstance.executionMode}
                                </span>
                                {isResearch ? (
                                  <span className="badge badge-paper">Research Output</span>
                                ) : (
                                  <span className="badge badge-paper">{p.proposedOrders.length} order{p.proposedOrders.length !== 1 ? "s" : ""}</span>
                                )}
                                {hardBlocked && <span className="badge badge-error">Risk Block</span>}
                                {!hardBlocked && riskWarnings > 0 && (
                                  <span className="badge badge-warning">{riskWarnings} warning{riskWarnings !== 1 ? "s" : ""}</span>
                                )}
                              </div>
                              <small className="ph-timestamp">{new Date(p.createdAt).toLocaleString()}</small>
                            </div>
                            <button onClick={() => setReviewPacket(p)} className="button button-primary button-sm">
                              Review
                            </button>
                          </div>
                          <p className="ph-rationale-preview">
                            {p.rationale.length > 200 ? `${p.rationale.slice(0, 200)}…` : p.rationale}
                          </p>
                          {!isResearch && p.proposedOrders.length > 0 && (
                            <div className="ph-order-summary">
                              {p.proposedOrders.slice(0, 4).map((o) => (
                                <span key={o.id} className={`ph-order-chip ${o.side.startsWith("BUY") ? "ph-order-chip-buy" : "ph-order-chip-sell"}`}>
                                  {o.side} {o.quantity} {o.symbol}
                                </span>
                              ))}
                              {p.proposedOrders.length > 4 && (
                                <span className="ph-order-chip-more">+{p.proposedOrders.length - 4} more</span>
                              )}
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Zone B: Decision History */}
              <div className="glass-card">
                <h2 className="card-title-mb-md icon-heading"><FileText size={16} /> Decision History</h2>
                {historyPackets.length === 0 ? (
                  <p className="card-description">No completed proposals yet.</p>
                ) : (
                  <div className="table-container"><table className="premium-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Strategy</th>
                        <th>Output Type</th>
                        <th>Orders</th>
                        <th>Status</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyPackets.map((p) => (
                        <tr key={p.id}>
                          <td><small className="font-mono">{new Date(p.createdAt).toLocaleString()}</small></td>
                          <td>{p.strategyInstance.name}</td>
                          <td>
                            <span className="badge badge-paper">
                              {p.strategyInstance.outputMode === "RANKED_IDEAS" ? "Research" : "Orders"}
                            </span>
                          </td>
                          <td className="font-mono">{p.proposedOrders.length}</td>
                          <td>
                            <span className={`badge ${p.status === "EXECUTED" ? "badge-success" : p.status === "REJECTED" ? "badge-error" : "badge-warning"}`}>
                              {p.status}
                            </span>
                          </td>
                          <td>
                            <button onClick={() => setReviewPacket(p)} className="button button-secondary button-sm">
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                )}
              </div>

            </div>
          );
        })()}

        {/* ─── TAB: AUDIT LOGS ────────────────────────────────────────────── */}
        {activeTab === "audit" && (() => {
          const q = auditFilter.trim().toLowerCase();
          const filtered = q
            ? auditLogs.filter(log =>
                log.action.toLowerCase().includes(q) ||
                log.target.toLowerCase().includes(q) ||
                log.actorType.toLowerCase().includes(q) ||
                (log.metadata && JSON.stringify(log.metadata).toLowerCase().includes(q))
              )
            : auditLogs;
          return (
            <div className="glass-card">
              <h2 className="card-title-mb-md icon-heading"><Shield size={18} /> Audit Trail</h2>
              <div className="audit-filter-row">
                <Search size={15} style={{ color: "var(--faint)", flexShrink: 0 }} />
                <input
                  type="search"
                  className="audit-filter-input"
                  placeholder="Filter by action, target, actor, or run ID…"
                  value={auditFilter}
                  onChange={e => setAuditFilter(e.target.value)}
                />
                {q && (
                  <span className="audit-filter-count">{filtered.length} of {auditLogs.length}</span>
                )}
                {q && (
                  <button type="button" className="button button-secondary button-sm" onClick={() => setAuditFilter("")}>
                    Clear
                  </button>
                )}
              </div>
              {auditLogs.length === 0 ? (
                <p className="empty-text">No audit log entries recorded.</p>
              ) : filtered.length === 0 ? (
                <p className="empty-text">No entries match "{auditFilter}".</p>
              ) : (
                <div className="table-container"><table className="premium-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Actor</th>
                      <th>Action</th>
                      <th>Target</th>
                      <th>Metadata</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((log) => (
                      <tr key={log.id}>
                        <td className="text-nowrap">{new Date(log.createdAt).toLocaleString()}</td>
                        <td><span className="badge badge-paper">{log.actorType}</span></td>
                        <td><strong>{log.action}</strong></td>
                        <td><code>{log.target}</code></td>
                        <td>
                          {log.metadata ? (
                            <button
                              type="button"
                              className="button button-secondary button-sm"
                              onClick={() => setAuditMetadataModal(log.metadata)}
                            >
                              View JSON
                            </button>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              )}
            </div>
          );
        })()}

        {/* ─── TAB: SETTINGS ──────────────────────────────────────────────── */}
        {activeTab === "settings" && (
          <div className="grid-gap-lg">
            {/* Help panel for credentials */}
            <HelpPanel title="How to Add Credentials">
              <div className="help-section">
                <strong>🤖 Model Providers (AI)</strong>
                <ul className="help-list">
                  <li><strong>OpenAI:</strong> Go to <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="help-link">platform.openai.com/api-keys</a> → Create new secret key. Use kind <code>MODEL_PROVIDER</code>, provider <code>openai</code>.</li>
                  <li><strong>Anthropic:</strong> Go to <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="help-link">console.anthropic.com</a> → API Keys → Create Key. Use provider <code>anthropic</code>.</li>
                  <li><strong>Local (Ollama/LM Studio):</strong> Run locally, use <code>http://localhost:11434/v1</code> as the base URL. No key needed — use any placeholder.</li>
                </ul>
              </div>
              <div className="help-section">
                <strong>📈 Brokers</strong>
                <ul className="help-list">
                  <li><strong>Alpaca:</strong> Get your API Key ID and Secret Key from <a href="https://app.alpaca.markets" target="_blank" rel="noopener noreferrer" className="help-link">app.alpaca.markets</a>.</li>
                  <li><strong>Interactive Brokers:</strong> Run the Client Portal Gateway and save its local base URL plus paper/live account IDs.</li>
                  <li>After saving the credential, go to <strong>Broker Accounts</strong> to link it to a trading environment.</li>
                </ul>
              </div>
            </HelpPanel>

            <div className="glass-card settings-card">
              <div className="settings-section-header">
                <p className="eyebrow">General Settings</p>
                <h2 className="card-title-mb-md icon-heading"><KeyRound size={18} /> Credential Vault</h2>
                <p className="card-description">
                  Credentials are encrypted before persistence and plaintext is never returned after save.
                </p>
              </div>
              <CredentialsForm addToast={addToast} showConfirm={showConfirm} />
            </div>

            <LivePinCard addToast={addToast} />
          </div>
        )}
      </main>

      {/* ─── MODAL: CONNECT BROKER ACCOUNT ────────────────────────────────── */}
      <dialog
        ref={connectDialogRef}
        className="modal-content"
        onClose={() => setShowConnectAccountModal(false)}
      >
        <div className="modal-header">
          <h2 className="margin-0">Connect Broker Account</h2>
          <button onClick={() => setShowConnectAccountModal(false)} className="modal-close-btn">×</button>
        </div>
        <div className="modal-scroll-body">
          <form onSubmit={handleConnectBrokerAccount} className="setup-form">
            <label>
              Linked Broker Key Credentials
              <select value={connectCredId} onChange={(e) => setConnectCredId(e.target.value)} required>
                <option value="">-- Choose saved credential --</option>
                {credentials.filter(c => c.kind === "BROKER").map(c => (
                  <option key={c.id} value={c.id}>{c.label} ({c.provider})</option>
                ))}
              </select>
            </label>

            <label>
              Account Label
              <input type="text" placeholder="My Paper Account" value={connectLabel} onChange={(e) => setConnectLabel(e.target.value)} required />
            </label>

            <label>
              Environment
              <select value={connectEnv} onChange={(e) => setConnectEnv(e.target.value as any)}>
                <option value="PAPER">PAPER (Simulation)</option>
                <option value="LIVE">LIVE (Real Money)</option>
              </select>
            </label>

            <div className="modal-footer-actions">
              <button type="button" onClick={() => setShowConnectAccountModal(false)} className="button button-secondary">Cancel</button>
              <button type="submit" disabled={!connectCredId || !connectLabel} className="button button-primary">Connect Account</button>
            </div>
          </form>
        </div>
      </dialog>

      {/* ─── MODAL: PROPOSED ORDER REVIEW PANEL ────────────────────────────── */}
      <dialog
        ref={reviewDialogRef}
        className="modal-content modal-content-lg"
        onClose={() => setReviewPacket(null)}
      >
        {reviewPacket && (() => {
          const isResearch = reviewPacket.strategyInstance.outputMode === "RANKED_IDEAS" || reviewPacket.proposedOrders.length === 0;
          const hardBlocked = reviewPacket.proposedOrders.some((o) => o.riskResult?.status === "hard_block");
          const isLive = reviewPacket.strategyInstance.executionMode === "LIVE";
          const isDraft = reviewPacket.status === "DRAFT" || reviewPacket.status === "PENDING_REVIEW";
          return (
            <>
              <div className="modal-header">
                <div className="review-modal-title-row">
                  <h2 className="margin-0">{isResearch ? "Research Output" : "Proposed Orders"}</h2>
                  <div className="ph-badges">
                    <span className={`badge ${isLive ? "badge-live" : "badge-paper"}`}>{reviewPacket.strategyInstance.executionMode}</span>
                    <span className="badge badge-paper">{isResearch ? "Research" : `${reviewPacket.proposedOrders.length} orders`}</span>
                    {!isDraft && (
                      <span className={`badge ${reviewPacket.status === "EXECUTED" ? "badge-success" : reviewPacket.status === "REJECTED" ? "badge-error" : "badge-warning"}`}>
                        {reviewPacket.status}
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => setReviewPacket(null)} className="modal-close-btn">×</button>
              </div>
              <div className="modal-scroll-body">

                <div className="review-modal-strategy-row">
                  <small className="eyebrow">Strategy</small>
                  <strong className="review-modal-strategy-name">{reviewPacket.strategyInstance.name}</strong>
                  <small className="ph-timestamp">{new Date(reviewPacket.createdAt).toLocaleString()}</small>
                </div>

                {reviewPacket.uncertaintyNote && (
                  <div className="review-uncertainty-note">
                    <strong>AI Uncertainty:</strong> {reviewPacket.uncertaintyNote}
                  </div>
                )}

                <div className="rationale-container">
                  <strong>AI Rationale</strong>
                  <p className="rationale-text">{reviewPacket.rationale}</p>
                </div>

                <AgentRunTrace metadata={reviewPacket.agentRunMetadata} />

                {isResearch ? (
                  <div className="review-research-note">
                    This strategy produces ranked research ideas, not executable orders. Review the rationale and agent trace above for the analysis output.
                  </div>
                ) : (
                  <>
                    <h3 className="review-orders-heading">Orders</h3>
                    {hardBlocked && (
                      <div className="review-block-banner">
                        One or more orders are hard-blocked by the risk engine. Execution is disabled until the block is resolved.
                      </div>
                    )}
                    <div className="table-container"><table className="premium-table">
                      <thead>
                        <tr>
                          <th>Symbol</th>
                          <th>Side</th>
                          <th>Qty</th>
                          <th>Type</th>
                          <th>Limit Price</th>
                          <th>Risk</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reviewPacket.proposedOrders.map((o) => (
                          <>
                            <tr key={o.id}>
                              <td><strong className="font-mono">{o.symbol}</strong></td>
                              <td><span className={o.side.startsWith("BUY") ? "side-buy" : "side-sell"}>{o.side}</span></td>
                              <td className="font-mono">{o.quantity}</td>
                              <td>{o.orderType}</td>
                              <td className="font-mono">{o.limitPrice ? `$${Number(o.limitPrice).toFixed(2)}` : "Market"}</td>
                              <td>
                                {o.riskResult ? (
                                  <div className="grid-gap-xs">
                                    <span className={`badge ${o.riskResult.status === "pass" ? "badge-success" : o.riskResult.status === "warning" ? "badge-warning" : "badge-error"}`}>
                                      {o.riskResult.status}
                                    </span>
                                    {o.riskResult.checks?.map((c: any, i: number) => (
                                      <small key={i} className={c.severity === "hard_block" ? "severity-hard-block" : "severity-warning"}>
                                        {c.message}
                                      </small>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="badge badge-warning">Unchecked</span>
                                )}
                              </td>
                            </tr>
                            {o.rationale && (
                              <tr key={`${o.id}-rationale`} className="review-order-rationale-row">
                                <td colSpan={6}>
                                  <small className="review-order-rationale">{o.rationale}</small>
                                </td>
                              </tr>
                            )}
                          </>
                        ))}
                      </tbody>
                    </table></div>
                  </>
                )}

                {isDraft && (
                  <div className="modal-footer-actions">
                    <button onClick={() => setReviewPacket(null)} className="button button-secondary">
                      Close
                    </button>
                    <button
                      onClick={() => handleRejectPacket(reviewPacket.id)}
                      className="button button-danger"
                    >
                      <XCircle size={14} /> Reject
                    </button>
                    {!isResearch && (
                      <button
                        onClick={() => handleExecutePacket(reviewPacket.id, isLive)}
                        disabled={hardBlocked}
                        className="button button-primary"
                      >
                        Approve & Execute
                      </button>
                    )}
                  </div>
                )}
                {!isDraft && (
                  <div className="modal-footer-actions">
                    <button onClick={() => setReviewPacket(null)} className="button button-secondary">
                      Close
                    </button>
                  </div>
                )}
              </div>
            </>
          );
        })()}
      </dialog>

      {/* ─── MODAL: AUDIT LOG METADATA ───────────────────────────────────── */}
      <dialog
        ref={auditMetadataDialogRef}
        className="modal-content"
        onClose={() => setAuditMetadataModal(null)}
      >
        <div className="modal-header">
          <h2 className="margin-0">Audit Log Metadata</h2>
          <button onClick={() => setAuditMetadataModal(null)} className="modal-close-btn">×</button>
        </div>
        <div className="modal-scroll-body">
          <pre className="audit-metadata-box audit-metadata-modal">
            {JSON.stringify(auditMetadataModal, null, 2)}
          </pre>
        </div>
      </dialog>

      {/* ─── MODAL: CUSTOM CONFIRMATION DIALOG ───────────────────────────── */}
      <dialog
        ref={confirmDialogRef}
        className={`modal-content ${confirmDialog?.danger ? "modal-content-danger" : ""}`}
        onClose={() => setConfirmDialog(null)}
      >
        {confirmDialog && (
          <>
            <h2 className={`modal-title ${confirmDialog.danger ? "modal-title-danger" : ""} icon-heading`}>
              {confirmDialog.danger ? <TriangleAlert size={18} /> : <FileText size={18} />}
              {confirmDialog.title}
            </h2>
            <p className="modal-body-text">{confirmDialog.message}</p>
            {confirmDialog.promptLabel && (
              <div className="form-field">
                <label className="form-label" htmlFor="confirm-prompt-input">{confirmDialog.promptLabel}</label>
                <input
                  id="confirm-prompt-input"
                  type="password"
                  autoComplete="off"
                  className="form-input"
                  value={confirmPromptValue}
                  onChange={(e) => setConfirmPromptValue(e.target.value)}
                />
              </div>
            )}
            <div className="modal-footer-actions">
              <button onClick={() => setConfirmDialog(null)} className="button button-secondary">
                Cancel
              </button>
              <button
                onClick={() => {
                  const onConfirm = confirmDialog.onConfirm;
                  const promptValue = confirmPromptValue;
                  setConfirmDialog(null);
                  onConfirm(confirmDialog.promptLabel ? promptValue : undefined);
                }}
                disabled={Boolean(confirmDialog.promptLabel) && confirmPromptValue.length === 0}
                className={`button ${confirmDialog.danger ? "button-danger" : "button-primary"}`}
              >
                {confirmDialog.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </>
        )}
      </dialog>

      {/* ─── RUN DETAIL SIDE PANEL ──────────────────────────────────────── */}
      {runPanelId && (
        <RunDetailSidePanel
          runId={runPanelId}
          onClose={() => setRunPanelId(null)}
        />
      )}

      {/* ─── TOAST CONTAINER ────────────────────────────────────────────── */}
      <div className="toast-container" aria-live="assertive">
        {toasts.map((t) => (
          <div key={t.id} className={`toast-card toast-${t.type}`}>
            <span className="toast-message">{t.message}</span>
            <button
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="toast-close"
              aria-label="Close notification"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
