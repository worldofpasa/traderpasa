-- CreateEnum
CREATE TYPE "AgentStepPhase" AS ENUM ('EVIDENCE', 'AGENT', 'RISK', 'EXECUTION');

-- CreateEnum
CREATE TYPE "AgentStepStatus" AS ENUM ('RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED', 'SKIPPED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JobRunStatus" ADD VALUE 'PARTIAL';
ALTER TYPE "JobRunStatus" ADD VALUE 'NEEDS_ACTION';
ALTER TYPE "JobRunStatus" ADD VALUE 'SKIPPED';

-- AlterTable
ALTER TABLE "JobRun" ADD COLUMN     "resumedFromJobRunId" TEXT,
ADD COLUMN     "resumedFromStepIndex" INTEGER;

-- CreateTable
CREATE TABLE "AgentStep" (
    "id" TEXT NOT NULL,
    "jobRunId" TEXT NOT NULL,
    "phase" "AgentStepPhase" NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "agentId" TEXT,
    "status" "AgentStepStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "outputData" JSONB,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentStep_jobRunId_phase_stepIndex_idx" ON "AgentStep"("jobRunId", "phase", "stepIndex");

-- CreateIndex
CREATE INDEX "JobRun_resumedFromJobRunId_idx" ON "JobRun"("resumedFromJobRunId");

-- AddForeignKey
ALTER TABLE "AgentStep" ADD CONSTRAINT "AgentStep_jobRunId_fkey" FOREIGN KEY ("jobRunId") REFERENCES "JobRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRun" ADD CONSTRAINT "JobRun_resumedFromJobRunId_fkey" FOREIGN KEY ("resumedFromJobRunId") REFERENCES "JobRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
