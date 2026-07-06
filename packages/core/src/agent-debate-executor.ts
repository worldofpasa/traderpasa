import type { PrismaClient } from "@pasa-trader/db";
import {
  getTeamExecution,
  TERMINAL_OUTPUT_TYPES,
  type AgentDefinition,
  type AgentTeamConfig,
  type AgentOutputType,
} from "@pasa-trader/schemas";
import {
  DynamicAgentTeamError,
  executeAgentDefinition,
  type AgentRunRecord,
  type DynamicTeamResult,
  type ResumeOptions,
} from "./dynamic-agent-executor.js";
import { markRemainingStepsSkipped } from "./agent-steps.js";
import { mergePrefetchIntoTopLevelVars, prefetchEvidenceForAgents } from "./agent-evidence-prefetch.js";

interface InvestDebateState {
  history: string;
  bull_history: string;
  bear_history: string;
  current_response: string;
  count: number;
}

interface RiskDebateState {
  history: string;
  aggressive_history: string;
  conservative_history: string;
  neutral_history: string;
  latest_speaker: string;
  current_aggressive_response: string;
  current_conservative_response: string;
  current_neutral_response: string;
  count: number;
}

function findAgent(agents: AgentDefinition[], spec: string): AgentDefinition {
  const agent = agents.find((a) => a.id === spec || a.specialization === spec);
  if (!agent) throw new Error(`Trading desk agent not found: ${spec}`);
  return agent;
}

function debateVars(state: InvestDebateState | RiskDebateState, prefix: string): Record<string, string> {
  if (prefix === "debate") {
    const s = state as InvestDebateState;
    return {
      "debate.history": s.history,
      "debate.current_response": s.current_response,
    };
  }
  const s = state as RiskDebateState;
  return {
    "risk_debate.history": s.history,
    "risk_debate.aggressive_response": s.current_aggressive_response,
    "risk_debate.conservative_response": s.current_conservative_response,
    "risk_debate.neutral_response": s.current_neutral_response,
  };
}

async function runAgentSafe(
  agent: AgentDefinition,
  stepIndex: number,
  intermediates: Map<string, unknown>,
  topLevelVars: Record<string, string>,
  userId: string,
  loggingDepth: "METADATA" | "FULL",
  db: PrismaClient,
  jobRunId: string | undefined,
  extraVars?: Record<string, string>,
  metadata?: Record<string, unknown>,
): Promise<{ run: AgentRunRecord; output: unknown }> {
  const mergedVars = extraVars ? { ...topLevelVars, ...extraVars } : topLevelVars;
  const result = await executeAgentDefinition(
    agent,
    stepIndex,
    intermediates,
    mergedVars,
    userId,
    loggingDepth,
    db,
    jobRunId,
  );
  if (metadata && jobRunId) {
    // metadata already stored via createAgentStep in executeAgentDefinition
    void metadata;
  }
  return result;
}

export async function runTradingDeskTeam(
  teamConfig: AgentTeamConfig,
  topLevelVars: Record<string, string>,
  userId: string,
  loggingDepth: "METADATA" | "FULL",
  db: PrismaClient,
  jobRunId?: string,
  resumeOptions?: ResumeOptions,
): Promise<DynamicTeamResult> {
  void resumeOptions;
  const execution = getTeamExecution(teamConfig);
  const agents = teamConfig.agents.filter((a) => a.enabled);
  const lastAgent = agents.find((a) => a.id === "portfolio-manager") ?? agents.at(-1);
  if (!lastAgent || !TERMINAL_OUTPUT_TYPES.includes(lastAgent.outputType)) {
    throw new Error("Trading desk must end with a terminal output type agent.");
  }

  const symbols = (topLevelVars.symbols ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const tradeDate = topLevelVars.trade_date ?? new Date().toISOString().slice(0, 10);
  const prefetch = prefetchEvidenceForAgents(agents, {
    symbols,
    tradeDate,
    evidenceItemsJson: topLevelVars.evidenceItems ?? "[]",
  });
  const vars = mergePrefetchIntoTopLevelVars(topLevelVars, prefetch);

  const intermediates = new Map<string, unknown>();
  const agentRuns: AgentRunRecord[] = [];
  let stepIndex = 0;

  const analystIds = execution.parallelGroups?.find((g) => g.id === "analysts")?.agentIds ?? [
    "market-analyst",
    "sentiment-analyst",
    "news-analyst",
    "fundamentals-analyst",
  ];

  const analystAgents = analystIds.map((id) => findAgent(agents, id));
  const analystResults = await Promise.all(
    analystAgents.map((agent) =>
      runAgentSafe(agent, stepIndex++, intermediates, vars, userId, loggingDepth, db, jobRunId),
    ),
  );
  for (const r of analystResults) {
    intermediates.set(r.run.agentId, r.output);
    agentRuns.push(r.run);
    if (r.run.error) {
      if (jobRunId) await markRemainingStepsSkipped(db, jobRunId, stepIndex);
      throw new DynamicAgentTeamError(`Analyst "${r.run.agentName}" failed: ${r.run.error}`, agentRuns);
    }
  }

  const bull = findAgent(agents, "BULL");
  const bear = findAgent(agents, "BEAR");
  const investDebate: InvestDebateState = {
    history: "",
    bull_history: "",
    bear_history: "",
    current_response: "",
    count: 0,
  };

  const maxInvestRounds = execution.maxDebateRounds;
  while (investDebate.count < 2 * maxInvestRounds) {
    const isBullTurn = investDebate.count % 2 === 0;
    const debator = isBullTurn ? bull : bear;
    const sideLabel = isBullTurn ? "Bull Analyst" : "Bear Analyst";
    const r = await runAgentSafe(
      debator,
      stepIndex++,
      intermediates,
      vars,
      userId,
      loggingDepth,
      db,
      jobRunId,
      debateVars(investDebate, "debate"),
      { debateRound: investDebate.count, debateSide: sideLabel },
    );
    agentRuns.push(r.run);
    if (r.run.error) {
      if (jobRunId) await markRemainingStepsSkipped(db, jobRunId, stepIndex);
      throw new DynamicAgentTeamError(`Debate agent failed: ${r.run.error}`, agentRuns);
    }
    const output = r.output as { thesis?: string } | null;
    const argument = `${sideLabel}: ${output?.thesis ?? JSON.stringify(output)}`;
    investDebate.history += (investDebate.history ? "\n" : "") + argument;
    if (isBullTurn) investDebate.bull_history += (investDebate.bull_history ? "\n" : "") + argument;
    else investDebate.bear_history += (investDebate.bear_history ? "\n" : "") + argument;
    investDebate.current_response = argument;
    investDebate.count += 1;
    intermediates.set(debator.id, r.output);
  }

  const researchManager = findAgent(agents, "RESEARCH_MANAGER");
  const rmResult = await runAgentSafe(
    researchManager,
    stepIndex++,
    intermediates,
    vars,
    userId,
    loggingDepth,
    db,
    jobRunId,
    debateVars(investDebate, "debate"),
  );
  agentRuns.push(rmResult.run);
  if (rmResult.run.error) {
    if (jobRunId) await markRemainingStepsSkipped(db, jobRunId, stepIndex);
    throw new DynamicAgentTeamError(`Research manager failed: ${rmResult.run.error}`, agentRuns);
  }
  intermediates.set(researchManager.id, rmResult.output);

  const trader = findAgent(agents, "TRADER");
  const traderResult = await runAgentSafe(trader, stepIndex++, intermediates, vars, userId, loggingDepth, db, jobRunId);
  agentRuns.push(traderResult.run);
  if (traderResult.run.error) {
    if (jobRunId) await markRemainingStepsSkipped(db, jobRunId, stepIndex);
    throw new DynamicAgentTeamError(`Trader failed: ${traderResult.run.error}`, agentRuns);
  }
  intermediates.set(trader.id, traderResult.output);

  const aggressive = findAgent(agents, "AGGRESSIVE");
  const conservative = findAgent(agents, "CONSERVATIVE");
  const neutral = findAgent(agents, "NEUTRAL");
  const riskDebate: RiskDebateState = {
    history: "",
    aggressive_history: "",
    conservative_history: "",
    neutral_history: "",
    latest_speaker: "",
    current_aggressive_response: "",
    current_conservative_response: "",
    current_neutral_response: "",
    count: 0,
  };

  const maxRiskRounds = execution.maxRiskDebateRounds;
  const riskOrder = ["AGGRESSIVE", "CONSERVATIVE", "NEUTRAL"] as const;
  while (riskDebate.count < 3 * maxRiskRounds) {
    const role = riskOrder[riskDebate.count % 3]!;
    const debator = findAgent(agents, role);
    const label = role === "AGGRESSIVE" ? "Aggressive Analyst" : role === "CONSERVATIVE" ? "Conservative Analyst" : "Neutral Analyst";
    const r = await runAgentSafe(
      debator,
      stepIndex++,
      intermediates,
      vars,
      userId,
      loggingDepth,
      db,
      jobRunId,
      debateVars(riskDebate, "risk_debate"),
      { debateRound: riskDebate.count, debateSide: label },
    );
    agentRuns.push(r.run);
    if (r.run.error) {
      if (jobRunId) await markRemainingStepsSkipped(db, jobRunId, stepIndex);
      throw new DynamicAgentTeamError(`Risk debator failed: ${r.run.error}`, agentRuns);
    }
    const output = r.output as { note?: string } | null;
    const argument = `${label}: ${output?.note ?? JSON.stringify(output)}`;
    riskDebate.history += (riskDebate.history ? "\n" : "") + argument;
    if (role === "AGGRESSIVE") {
      riskDebate.aggressive_history += (riskDebate.aggressive_history ? "\n" : "") + argument;
      riskDebate.current_aggressive_response = argument;
    } else if (role === "CONSERVATIVE") {
      riskDebate.conservative_history += (riskDebate.conservative_history ? "\n" : "") + argument;
      riskDebate.current_conservative_response = argument;
    } else {
      riskDebate.neutral_history += (riskDebate.neutral_history ? "\n" : "") + argument;
      riskDebate.current_neutral_response = argument;
    }
    riskDebate.latest_speaker = label;
    riskDebate.count += 1;
    intermediates.set(debator.id, r.output);
  }

  const portfolioManager = findAgent(agents, "PORTFOLIO_MANAGER");
  const pmResult = await runAgentSafe(
    portfolioManager,
    stepIndex++,
    intermediates,
    vars,
    userId,
    loggingDepth,
    db,
    jobRunId,
    debateVars(riskDebate, "risk_debate"),
  );
  agentRuns.push(pmResult.run);
  if (pmResult.run.error) {
    if (jobRunId) await markRemainingStepsSkipped(db, jobRunId, stepIndex);
    throw new DynamicAgentTeamError(`Portfolio manager failed: ${pmResult.run.error}`, agentRuns);
  }

  return {
    finalOutput: pmResult.output,
    terminalOutputType: lastAgent.outputType as AgentOutputType,
    agentRuns,
  };
}
