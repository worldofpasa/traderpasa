export interface AgentWorkflowDefinition {
  readonly id: string;
  readonly description: string;
}

export {
  AgentWorkflowExecutor,
  generateWithRepair,
  generateWithRepairResult,
  type AgentContext,
  type AgentWorkflowStep,
  type GenerateWithRepairResult,
} from "./runtime.js";

export {
  evidenceSummarySchema,
  agentOrderSchema,
  agentRankedIdeaSchema,
  orderGenerationSchema,
  EvidenceSummarizerStep,
  OrderGenerationStep,
  type EvidenceSummary,
  type AgentOrder,
  type AgentRankedIdea,
  type OrderGenerationResult,
  type EvidenceItemInput,
  type OrderGenerationInput,
} from "./synthesis.js";

export {
  evidenceAnalysisSchema,
  debateThesisSchema,
  synthesisSchema,
  riskReviewSchema,
  OUTPUT_TYPE_SCHEMAS,
  OUTPUT_TYPE_SCHEMA_HINTS,
  outputTypeSchemas,
  validateAgentOutput,
  AgentOutputValidationError,
  type EvidenceAnalysis,
  type DebateThesis,
  type Synthesis,
  type RankedIdeas,
  type RiskReview,
} from "./output-types.js";

export { ROLE_DEFAULTS, roleDefaults, type RoleDefault } from "./role-defaults.js";

export {
  BUILTIN_AGENT_TEMPLATE_SEEDS,
  buildTradingDeskTeamConfig,
  catalogPrompts,
  type AgentTemplateSeed,
} from "./catalog/index.js";
