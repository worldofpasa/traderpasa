-- Add stepModelConfig to StrategyInstance for per-step model credential assignment
ALTER TABLE "StrategyInstance" ADD COLUMN "stepModelConfig" JSONB NOT NULL DEFAULT '{}';
