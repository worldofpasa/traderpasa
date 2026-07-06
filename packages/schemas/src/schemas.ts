import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

export const sessionCookieName = "pasa_session";
export const csrfCookieName = "pasa_csrf";
export const csrfHeaderName = "x-csrf-token";

export const isoDateTimeSchema = z.iso.datetime({ offset: true });

export const sourceReliabilityClassSchema = z.enum([
  "official_api",
  "official_scrape",
  "third_party_api",
  "best_effort_scrape",
]);

export type SourceReliabilityClass = z.infer<typeof sourceReliabilityClassSchema>;

export const sourceStatusSchema = z.enum(["succeeded", "failed", "stale", "skipped", "partial"]);

export type SourceStatus = z.infer<typeof sourceStatusSchema>;

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("pasa-trader-platform"),
  checkedAt: isoDateTimeSchema,
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
  }),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export const setupStatusResponseSchema = z.object({
  needsFirstAdmin: z.boolean(),
});

export type SetupStatusResponse = z.infer<typeof setupStatusResponseSchema>;

export const setupFirstAdminRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(12).max(256),
});

export type SetupFirstAdminRequest = z.infer<typeof setupFirstAdminRequestSchema>;

export const setupFirstAdminResponseSchema = z.object({
  user: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    email: z.email(),
    role: z.literal("ADMIN"),
  }),
});

export type SetupFirstAdminResponse = z.infer<typeof setupFirstAdminResponseSchema>;

export const userRoleSchema = z.enum(["ADMIN", "USER"]);

export type UserRole = z.infer<typeof userRoleSchema>;

export const authUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.email(),
  role: userRoleSchema,
});

export type AuthUser = z.infer<typeof authUserSchema>;

export const signInRequestSchema = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(1).max(256),
});

export type SignInRequest = z.infer<typeof signInRequestSchema>;

export const signInResponseSchema = z.object({
  user: authUserSchema,
  expiresAt: isoDateTimeSchema,
});

export type SignInResponse = z.infer<typeof signInResponseSchema>;

export const currentUserResponseSchema = z.object({
  user: authUserSchema.nullable(),
});

export type CurrentUserResponse = z.infer<typeof currentUserResponseSchema>;

export const logoutResponseSchema = z.object({
  ok: z.literal(true),
});

export type LogoutResponse = z.infer<typeof logoutResponseSchema>;

export const credentialKindSchema = z.enum([
  "BROKER",
  "MODEL_PROVIDER",
  "SOURCE_PROVIDER",
  "NOTIFICATION_PROVIDER",
]);

export type CredentialKind = z.infer<typeof credentialKindSchema>;

export const credentialSummarySchema = z.object({
  id: z.string().min(1),
  kind: credentialKindSchema,
  provider: z.string().min(1),
  label: z.string().min(1),
  keyVersion: z.string().min(1),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type CredentialSummary = z.infer<typeof credentialSummarySchema>;

export const listCredentialsResponseSchema = z.object({
  credentials: z.array(credentialSummarySchema),
});

export type ListCredentialsResponse = z.infer<typeof listCredentialsResponseSchema>;

export const createCredentialRequestSchema = z.object({
  kind: credentialKindSchema,
  provider: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  secret: z.string().min(1).max(10_000),
});

export type CreateCredentialRequest = z.infer<typeof createCredentialRequestSchema>;

export const createCredentialResponseSchema = z.object({
  credential: credentialSummarySchema,
});

export type CreateCredentialResponse = z.infer<typeof createCredentialResponseSchema>;

export const strategyKindSchema = z.enum([
  "LONG_TERM_ALLOCATION",
  "MOMENTUM",
  "SCALPING_DAY_TRADE_TEST",
  "NEWS_DRIVEN",
  "INSIDER_POLITICAL_TRADE_FOLLOWING",
]);

export type StrategyKind = z.infer<typeof strategyKindSchema>;

export const strategyTemplateSummarySchema = z.object({
  id: z.string().min(1),
  kind: strategyKindSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  defaultConfig: z.record(z.string(), z.unknown()),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type StrategyTemplateSummary = z.infer<typeof strategyTemplateSummarySchema>;

export const listStrategyTemplatesResponseSchema = z.object({
  templates: z.array(strategyTemplateSummarySchema),
});

export type ListStrategyTemplatesResponse = z.infer<typeof listStrategyTemplatesResponseSchema>;

export const strategyInstanceStatusSchema = z.enum(["ENABLED", "DISABLED", "DELETED"]);
export type StrategyInstanceStatus = z.infer<typeof strategyInstanceStatusSchema>;

export const watchlistModeSchema = z.enum(["MANUAL", "DYNAMIC"]);
export type WatchlistMode = z.infer<typeof watchlistModeSchema>;

export const outputModeSchema = z.enum(["PROPOSED_ORDERS", "RANKED_IDEAS"]);
export type OutputMode = z.infer<typeof outputModeSchema>;

export const executionModeSchema = z.enum(["PAPER", "LIVE"]);
export type ExecutionMode = z.infer<typeof executionModeSchema>;

export const modelLoggingDepthSchema = z.enum(["METADATA", "FULL"]);
export type ModelLoggingDepth = z.infer<typeof modelLoggingDepthSchema>;

export const stepModelConfigSchema = z.object({
  summarizer: z.string().min(1).optional(),
  orderGeneration: z.string().min(1).optional(),
}).strict();
export type StepModelConfig = z.infer<typeof stepModelConfigSchema>;

// ─── Agent Team Configuration ────────────────────────────────────────────────

export const agentRoleTypeSchema = z.enum([
  "ANALYST",
  "RESEARCHER",
  "SYNTHESIZER",
  "TRADER",
  "RISK_REVIEWER",
]);
export type AgentRoleType = z.infer<typeof agentRoleTypeSchema>;

export const agentOutputTypeSchema = z.enum([
  "EVIDENCE_ANALYSIS",
  "DEBATE_THESIS",
  "SYNTHESIS",
  "PROPOSED_ORDERS",
  "RANKED_IDEAS",
  "RISK_REVIEW",
  "SENTIMENT_REPORT",
]);
export type AgentOutputType = z.infer<typeof agentOutputTypeSchema>;

export const agentCategorySchema = z.enum([
  "ANALYST",
  "RESEARCHER",
  "MANAGER",
  "TRADER",
  "RISK_DEBATOR",
]);
export type AgentCategory = z.infer<typeof agentCategorySchema>;

export const agentSpecializationSchema = z.enum([
  "MARKET",
  "SENTIMENT",
  "NEWS",
  "FUNDAMENTALS",
  "BULL",
  "BEAR",
  "RESEARCH_MANAGER",
  "PORTFOLIO_MANAGER",
  "TRADER",
  "AGGRESSIVE",
  "CONSERVATIVE",
  "NEUTRAL",
]);
export type AgentSpecialization = z.infer<typeof agentSpecializationSchema>;

export const agentVariableSourceSchema = z.enum([
  "RUNTIME",
  "EVIDENCE",
  "UPSTREAM_AGENT",
  "DEBATE_STATE",
]);
export type AgentVariableSource = z.infer<typeof agentVariableSourceSchema>;

export const agentVariableSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  source: agentVariableSourceSchema,
  required: z.boolean(),
  description: z.string().min(1),
  example: z.string().optional(),
});
export type AgentVariable = z.infer<typeof agentVariableSchema>;

export const agentToolRefSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  evidenceConnectorId: z.string().optional(),
  reliability: sourceReliabilityClassSchema,
  params: z.record(z.string(), z.string()).optional(),
});
export type AgentToolRef = z.infer<typeof agentToolRefSchema>;

export const agentDebateSideSchema = z.enum([
  "BULL",
  "BEAR",
  "AGGRESSIVE",
  "CONSERVATIVE",
  "NEUTRAL",
]);
export type AgentDebateSide = z.infer<typeof agentDebateSideSchema>;

export const agentDefinitionSchema = z.object({
  id: z.string().trim().min(1).max(64).regex(/^[a-z0-9-]+$/, "Agent ID must be lowercase alphanumeric with hyphens"),
  name: z.string().trim().min(1).max(80),
  role: agentRoleTypeSchema,
  systemPrompt: z.string().min(1).max(12000),
  userPromptTemplate: z.string().min(1).max(8000),
  outputType: agentOutputTypeSchema,
  credentialId: z.string().min(1).optional(),
  templateId: z.string().uuid().optional(),
  specialization: agentSpecializationSchema.optional(),
  handoffFrom: z.array(z.string().min(1)).default([]),
  order: z.number().int().min(0),
  enabled: z.boolean().default(true),
});
export type AgentDefinition = z.infer<typeof agentDefinitionSchema>;

export const agentTeamExecutionSchema = z.object({
  mode: z.enum(["LINEAR", "DAG", "TRADING_DESK"]).default("LINEAR"),
  maxDebateRounds: z.number().int().min(1).max(5).default(1),
  maxRiskDebateRounds: z.number().int().min(1).max(5).default(1),
  parallelGroups: z.array(z.object({
    id: z.string().min(1),
    agentIds: z.array(z.string().min(1)),
  })).optional(),
  layoutPositions: z.record(z.string(), z.object({
    x: z.number(),
    y: z.number(),
  })).optional(),
}).default({
  mode: "LINEAR",
  maxDebateRounds: 1,
  maxRiskDebateRounds: 1,
});

export const agentTeamConfigV1Schema = z.object({
  version: z.literal(1),
  agents: z.array(agentDefinitionSchema).min(1).max(20),
}).strict();

export const agentTeamConfigV2Schema = z.object({
  version: z.literal(2),
  agents: z.array(agentDefinitionSchema).min(1).max(30),
  execution: agentTeamExecutionSchema,
}).strict();

export const agentTeamConfigSchema = z.discriminatedUnion("version", [
  agentTeamConfigV1Schema,
  agentTeamConfigV2Schema,
]);
export type AgentTeamConfig = z.infer<typeof agentTeamConfigSchema>;
export type AgentTeamConfigV1 = z.infer<typeof agentTeamConfigV1Schema>;
export type AgentTeamConfigV2 = z.infer<typeof agentTeamConfigV2Schema>;

export const agentTemplateSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(80),
  category: agentCategorySchema,
  role: agentRoleTypeSchema,
  specialization: agentSpecializationSchema,
  description: z.string().min(1).max(500),
  systemPrompt: z.string().min(1).max(12000),
  userPromptTemplate: z.string().min(1).max(8000),
  outputType: agentOutputTypeSchema,
  variables: z.array(agentVariableSchema),
  toolRefs: z.array(agentToolRefSchema),
  defaultDebateSide: agentDebateSideSchema.optional(),
  isBuiltin: z.boolean(),
  userId: z.string().uuid().nullable(),
  createdAt: isoDateTimeSchema.optional(),
  updatedAt: isoDateTimeSchema.optional(),
});
export type AgentTemplate = z.infer<typeof agentTemplateSchema>;

export const createAgentTemplateRequestSchema = agentTemplateSchema.omit({
  id: true,
  isBuiltin: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});

export const updateAgentTemplateRequestSchema = createAgentTemplateRequestSchema.partial();
export type CreateAgentTemplateRequest = z.infer<typeof createAgentTemplateRequestSchema>;
export type UpdateAgentTemplateRequest = z.infer<typeof updateAgentTemplateRequestSchema>;

export const listAgentTemplatesResponseSchema = z.object({
  templates: z.array(agentTemplateSchema),
  grouped: z.record(agentCategorySchema, z.array(agentTemplateSchema)),
});

export type ListAgentTemplatesResponse = z.infer<typeof listAgentTemplatesResponseSchema>;

export const agentTemplateResponseSchema = z.object({
  template: agentTemplateSchema,
});

export function parseAgentTeamConfig(raw: unknown): AgentTeamConfig | null {
  if (!raw || typeof raw !== "object" || Object.keys(raw).length === 0) return null;
  return agentTeamConfigSchema.parse(raw);
}

export function getTeamExecution(config: AgentTeamConfig) {
  if (config.version === 2) return config.execution;
  return agentTeamExecutionSchema.parse({});
}

// Terminal output types that a valid pipeline must end with
export const TERMINAL_OUTPUT_TYPES: AgentOutputType[] = [
  "PROPOSED_ORDERS",
  "RANKED_IDEAS",
  "SYNTHESIS",
];

export const strategyInstanceSummarySchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  templateId: z.string().min(1),
  brokerAccountId: z.string().min(1).nullable(),
  name: z.string().min(1),
  description: z.string().nullable(),
  status: strategyInstanceStatusSchema,
  watchlistMode: watchlistModeSchema,
  symbols: z.array(z.string()),
  sourceConfig: z.record(z.string(), z.unknown()),
  riskConfig: z.record(z.string(), z.unknown()),
  outputMode: outputModeSchema,
  executionMode: executionModeSchema,
  liveAcknowledgedAt: isoDateTimeSchema.nullable(),
  marketSessionRules: z.record(z.string(), z.unknown()),
  scheduleConfig: z.record(z.string(), z.unknown()).nullable(),
  trailingStopConfig: z.record(z.string(), z.unknown()).nullable(),
  modelLoggingDepth: modelLoggingDepthSchema,
  stepModelConfig: z.record(z.string(), z.unknown()),
  agentTeamConfig: z.record(z.string(), z.unknown()),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type StrategyInstanceSummary = z.infer<typeof strategyInstanceSummarySchema>;

export const sourceConnectorConfigSchema = z.object({
  enabled: z.boolean(),
  required: z.boolean(),
});

export type SourceConnectorConfig = z.infer<typeof sourceConnectorConfigSchema>;

export const strategySourceConfigSchema = z.record(z.string(), sourceConnectorConfigSchema);
export type StrategySourceConfig = z.infer<typeof strategySourceConfigSchema>;

export const strategyRiskConfigSchema = z.object({
  maxPositionPct: z.number().positive().max(100).optional(),
  maxAccountExposurePct: z.number().positive().max(100).optional(),
  maxOrdersPerDay: z.number().int().positive().optional(),
  dailyLossThresholdPct: z.number().positive().max(100).optional(),
  restrictedTickers: z.array(z.string().min(1)).optional(),
});

export type StrategyRiskConfig = z.infer<typeof strategyRiskConfigSchema>;

export const marketSessionRulesSchema = z.object({
  sessionOnly: z.boolean().optional(),
  allowPreMarket: z.boolean().optional(),
  allowAfterHours: z.boolean().optional(),
});

export type MarketSessionRules = z.infer<typeof marketSessionRulesSchema>;

export const scheduleConfigSchema = z.object({
  cron: z.string().min(1).optional(),
  runAt: isoDateTimeSchema.optional(),
  timezone: z.string().min(1).optional(),
}).refine((v) => v.cron !== undefined || v.runAt !== undefined, {
  message: "scheduleConfig must have either cron or runAt",
});

export type ScheduleConfig = z.infer<typeof scheduleConfigSchema>;

export const trailingStopConfigSchema = z.object({
  trailPercent: z.number().positive().max(100).optional(),
  trailDollars: z.number().positive().optional(),
}).refine((v) => v.trailPercent !== undefined || v.trailDollars !== undefined, {
  message: "trailingStopConfig must have either trailPercent or trailDollars",
});

export type TrailingStopConfig = z.infer<typeof trailingStopConfigSchema>;

export const updateStrategyInstanceRequestSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).optional(),
  brokerAccountId: z.string().min(1).nullable().optional(),
  watchlistMode: watchlistModeSchema.optional(),
  symbols: z.array(z.string().trim().min(1).max(10).toUpperCase()).max(100).optional(),
  sourceConfig: strategySourceConfigSchema.optional(),
  riskConfig: strategyRiskConfigSchema.optional(),
  outputMode: outputModeSchema.optional(),
  executionMode: executionModeSchema.optional(),
  marketSessionRules: marketSessionRulesSchema.optional(),
  scheduleConfig: scheduleConfigSchema.nullable().optional(),
  trailingStopConfig: trailingStopConfigSchema.nullable().optional(),
  modelLoggingDepth: modelLoggingDepthSchema.optional(),
  stepModelConfig: stepModelConfigSchema.optional(),
  agentTeamConfig: agentTeamConfigSchema.optional(),
});

export type UpdateStrategyInstanceRequest = z.infer<typeof updateStrategyInstanceRequestSchema>;

export const updateStrategyInstanceResponseSchema = z.object({
  instance: strategyInstanceSummarySchema,
});

export type UpdateStrategyInstanceResponse = z.infer<typeof updateStrategyInstanceResponseSchema>;

export const forkStrategyTemplateRequestSchema = z.object({
  templateId: z.string().min(1),
  name: z.string().trim().min(1).max(120).optional(),
});

export type ForkStrategyTemplateRequest = z.infer<typeof forkStrategyTemplateRequestSchema>;

export const forkStrategyTemplateResponseSchema = z.object({
  instance: strategyInstanceSummarySchema,
});

export type ForkStrategyTemplateResponse = z.infer<typeof forkStrategyTemplateResponseSchema>;

export const listStrategyInstancesResponseSchema = z.object({
  instances: z.array(strategyInstanceSummarySchema),
});

export type ListStrategyInstancesResponse = z.infer<typeof listStrategyInstancesResponseSchema>;

export const auditActorTypeSchema = z.enum(["SYSTEM", "USER"]);

export type AuditActorType = z.infer<typeof auditActorTypeSchema>;

export const auditLogEntrySchema = z.object({
  id: z.string().min(1),
  actorType: auditActorTypeSchema,
  actorId: z.string().min(1).nullable(),
  action: z.string().min(1),
  target: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: isoDateTimeSchema,
});

export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>;

export const listAuditLogsResponseSchema = z.object({
  entries: z.array(auditLogEntrySchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});

export type ListAuditLogsResponse = z.infer<typeof listAuditLogsResponseSchema>;

export const evidenceItemSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  sourceName: z.string().min(1),
  reliabilityClass: sourceReliabilityClassSchema,
  status: sourceStatusSchema,
  observedAt: isoDateTimeSchema,
  staleAt: isoDateTimeSchema.optional(),
  symbols: z.array(z.string().min(1)).default([]),
  title: z.string().min(1),
  summary: z.string().min(1),
  url: z.url().optional(),
  warnings: z.array(z.string().min(1)).default([]),
  payloadRef: z.string().min(1).optional(),
});

export type EvidenceItem = z.infer<typeof evidenceItemSchema>;

export const orderSideSchema = z.enum(["buy", "sell", "sell_short", "buy_to_cover"]);

export type OrderSide = z.infer<typeof orderSideSchema>;

export const orderTypeSchema = z.enum(["market", "limit"]);

export type OrderType = z.infer<typeof orderTypeSchema>;

export const brokerageEnvironmentSchema = z.enum(["paper", "live"]);

export type BrokerageEnvironment = z.infer<typeof brokerageEnvironmentSchema>;

export const proposedOrderSchema = z.object({
  id: z.string().min(1),
  symbol: z.string().min(1),
  side: orderSideSchema,
  quantity: z.number().int().positive(),
  orderType: orderTypeSchema,
  limitPrice: z.number().positive().optional(),
  accountId: z.string().min(1),
  environment: brokerageEnvironmentSchema,
  rationale: z.string().min(1),
  evidenceItemIds: z.array(z.string().min(1)).min(1),
});

export type ProposedOrder = z.infer<typeof proposedOrderSchema>;

export const riskSeveritySchema = z.enum(["pass", "warning", "hard_block"]);

export type RiskSeverity = z.infer<typeof riskSeveritySchema>;

export const riskCheckSchema = z.object({
  code: z.string().min(1),
  severity: riskSeveritySchema,
  message: z.string().min(1),
  orderId: z.string().min(1).optional(),
});

export type RiskCheck = z.infer<typeof riskCheckSchema>;

export const riskResultSchema = z.object({
  status: riskSeveritySchema,
  checks: z.array(riskCheckSchema),
});

export type RiskResult = z.infer<typeof riskResultSchema>;

// ─── Model Provider Credential Secret ──────────────────────────────────────

export const modelProviderCredentialSecretSchema = z.object({
  apiKey: z.string().trim().min(1),
  baseUrl: z.string().url().optional(),
  model: z.string().trim().min(1).optional(),
});

export type ModelProviderCredentialSecret = z.infer<typeof modelProviderCredentialSecretSchema>;

// Provider is now open — any string is valid (openai, anthropic, openrouter, ollama, etc.)
export const testModelConnectionRequestSchema = z.object({
  credentialId: z.string().min(1),
  provider: z.string().min(1),
});

export type TestModelConnectionRequest = z.infer<typeof testModelConnectionRequestSchema>;

export const testModelConnectionResponseSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  checkedAt: isoDateTimeSchema,
});

export type TestModelConnectionResponse = z.infer<typeof testModelConnectionResponseSchema>;

// ─── Alpaca Credential Secret ───────────────────────────────────────────────

export const alpacaCredentialSecretSchema = z.object({
  keyId: z.string().trim().min(1),
  secretKey: z.string().trim().min(1),
});

export type AlpacaCredentialSecret = z.infer<typeof alpacaCredentialSecretSchema>;

// ─── IBKR Credential Secret ────────────────────────────────────────────────

export const ibkrCredentialSecretSchema = z.object({
  baseUrl: z.url().default("https://localhost:5000/v1/api"),
  sessionToken: z.string().trim().min(1).optional(),
  paperAccountId: z.string().trim().min(1).optional(),
  liveAccountId: z.string().trim().min(1).optional(),
});

export type IbkrCredentialSecret = z.infer<typeof ibkrCredentialSecretSchema>;

// ─── Broker Accounts ────────────────────────────────────────────────────────

export const brokerProviderSchema = z.enum(["alpaca", "ibkr"]);

export type BrokerProvider = z.infer<typeof brokerProviderSchema>;

export const brokerAccountStatusSchema = z.enum(["UNTESTED", "CONNECTED", "ERROR"]);

export type BrokerAccountStatus = z.infer<typeof brokerAccountStatusSchema>;

export const brokerEnvironmentSchema = z.enum(["PAPER", "LIVE"]);

export type BrokerEnvironment = z.infer<typeof brokerEnvironmentSchema>;

export const brokerAccountSummarySchema = z.object({
  id: z.string().min(1),
  credentialId: z.string().min(1),
  provider: z.string().min(1),
  label: z.string().min(1),
  environment: brokerEnvironmentSchema,
  brokerAccountId: z.string().min(1).nullable(),
  status: brokerAccountStatusSchema,
  lastTestedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type BrokerAccountSummary = z.infer<typeof brokerAccountSummarySchema>;

export const listBrokerAccountsResponseSchema = z.object({
  brokerAccounts: z.array(brokerAccountSummarySchema),
});

export type ListBrokerAccountsResponse = z.infer<typeof listBrokerAccountsResponseSchema>;

export const createBrokerAccountRequestSchema = z.object({
  credentialId: z.string().min(1),
  label: z.string().trim().min(1).max(120),
  environment: brokerEnvironmentSchema,
});

export type CreateBrokerAccountRequest = z.infer<typeof createBrokerAccountRequestSchema>;

export const createBrokerAccountResponseSchema = z.object({
  brokerAccount: brokerAccountSummarySchema,
});

export type CreateBrokerAccountResponse = z.infer<typeof createBrokerAccountResponseSchema>;

export const testBrokerConnectionRequestSchema = z.object({
  credentialId: z.string().min(1),
  environment: brokerEnvironmentSchema,
});

export type TestBrokerConnectionRequest = z.infer<typeof testBrokerConnectionRequestSchema>;

export const testBrokerConnectionResponseSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  checkedAt: isoDateTimeSchema,
});

export type TestBrokerConnectionResponse = z.infer<typeof testBrokerConnectionResponseSchema>;
