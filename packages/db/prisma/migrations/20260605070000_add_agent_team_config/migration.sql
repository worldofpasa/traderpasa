-- Add agentTeamConfig to StrategyInstance for configurable agent pipeline definitions
ALTER TABLE "StrategyInstance" ADD COLUMN "agentTeamConfig" JSONB NOT NULL DEFAULT '{}';
