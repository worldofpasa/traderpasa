export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface Credential {
  id: string;
  kind: string;
  provider: string;
  label: string;
  createdAt: string;
}

export interface BrokerAccount {
  id: string;
  credentialId: string;
  provider: string;
  label: string;
  environment: "PAPER" | "LIVE";
  brokerAccountId: string | null;
  status: "UNTESTED" | "CONNECTED" | "ERROR";
  lastTestedAt: string | null;
}

export interface StrategyTemplate {
  id: string;
  kind: string;
  name: string;
  description: string;
  defaultConfig: Record<string, unknown>;
}

export interface StrategyScheduleConfig {
  cron?: unknown;
}

export interface StrategyInstance {
  id: string;
  name: string;
  description: string | null;
  status: "ENABLED" | "DISABLED" | "DELETED";
  watchlistMode: "MANUAL" | "DYNAMIC";
  symbols: string[];
  sourceConfig: Record<string, unknown>;
  riskConfig: Record<string, unknown>;
  outputMode: "PROPOSED_ORDERS" | "RANKED_IDEAS";
  executionMode: "PAPER" | "LIVE";
  liveAcknowledgedAt: string | null;
  marketSessionRules: Record<string, unknown>;
  scheduleConfig: StrategyScheduleConfig | null;
  trailingStopConfig: Record<string, unknown> | null;
  modelLoggingDepth: "METADATA" | "FULL";
  stepModelConfig: { summarizer?: string; orderGeneration?: string };
  agentTeamConfig: Record<string, unknown>;
  brokerAccountId: string | null;
  templateId: string;
}

export interface JobRun {
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
  outputRefs: {
    skipped?: string;
    evidenceBundleId?: string;
    proposedOrderPacketId?: string;
    executionResult?: string;
  } | null;
  agentRunMetadata?: unknown;
}

export type StrategyTabId = "overview" | "agents" | "runs" | "settings";

export const STRATEGY_TABS: { id: StrategyTabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "agents", label: "Agent Graph" },
  { id: "runs", label: "Runs" },
  { id: "settings", label: "Settings" },
];
