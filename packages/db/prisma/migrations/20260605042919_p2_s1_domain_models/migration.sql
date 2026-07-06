-- CreateEnum
CREATE TYPE "BrokerEnvironment" AS ENUM ('PAPER', 'LIVE');

-- CreateEnum
CREATE TYPE "BrokerAccountStatus" AS ENUM ('UNTESTED', 'CONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "StrategyKind" AS ENUM ('LONG_TERM_ALLOCATION', 'MOMENTUM', 'SCALPING_DAY_TRADE_TEST', 'NEWS_DRIVEN', 'INSIDER_POLITICAL_TRADE_FOLLOWING');

-- CreateEnum
CREATE TYPE "StrategyInstanceStatus" AS ENUM ('ENABLED', 'DISABLED', 'DELETED');

-- CreateEnum
CREATE TYPE "WatchlistMode" AS ENUM ('MANUAL', 'DYNAMIC');

-- CreateEnum
CREATE TYPE "OutputMode" AS ENUM ('PROPOSED_ORDERS', 'RANKED_IDEAS');

-- CreateEnum
CREATE TYPE "ExecutionMode" AS ENUM ('PAPER', 'LIVE');

-- CreateEnum
CREATE TYPE "ModelLoggingDepth" AS ENUM ('METADATA', 'FULL');

-- CreateEnum
CREATE TYPE "EvidenceBundleStatus" AS ENUM ('COMPLETE', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "EvidenceItemStatus" AS ENUM ('SUCCEEDED', 'FAILED', 'STALE', 'SKIPPED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "SourceReliabilityClass" AS ENUM ('OFFICIAL_API', 'OFFICIAL_SCRAPE', 'THIRD_PARTY_API', 'BEST_EFFORT_SCRAPE');

-- CreateEnum
CREATE TYPE "PacketStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'EXECUTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ProposedOrderStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXECUTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderSide" AS ENUM ('BUY', 'SELL', 'SELL_SHORT', 'BUY_TO_COVER');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('MARKET', 'LIMIT');

-- CreateEnum
CREATE TYPE "OrderRecordStatus" AS ENUM ('SUBMITTED', 'FILLED', 'PARTIAL_FILL', 'CANCELLED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "JobRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'RETRYING');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('BROKER_OUTAGE', 'EXECUTION_FAILURE', 'RISK_BLOCK', 'MISSING_EVIDENCE', 'STOP_FAILURE', 'PAPER_EXECUTED', 'LIVE_EXECUTED', 'STRATEGY_CONFLICT', 'GENERIC');

-- CreateEnum
CREATE TYPE "NotificationSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateTable
CREATE TABLE "BrokerAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "environment" "BrokerEnvironment" NOT NULL,
    "brokerAccountId" TEXT,
    "status" "BrokerAccountStatus" NOT NULL DEFAULT 'UNTESTED',
    "lastTestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrokerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyTemplate" (
    "id" TEXT NOT NULL,
    "kind" "StrategyKind" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "defaultConfig" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StrategyTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyInstance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "brokerAccountId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "StrategyInstanceStatus" NOT NULL DEFAULT 'DISABLED',
    "watchlistMode" "WatchlistMode" NOT NULL DEFAULT 'MANUAL',
    "symbols" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceConfig" JSONB NOT NULL DEFAULT '{}',
    "riskConfig" JSONB NOT NULL DEFAULT '{}',
    "outputMode" "OutputMode" NOT NULL DEFAULT 'PROPOSED_ORDERS',
    "executionMode" "ExecutionMode" NOT NULL DEFAULT 'PAPER',
    "liveAcknowledgedAt" TIMESTAMP(3),
    "marketSessionRules" JSONB NOT NULL DEFAULT '{}',
    "scheduleConfig" JSONB,
    "trailingStopConfig" JSONB,
    "modelLoggingDepth" "ModelLoggingDepth" NOT NULL DEFAULT 'METADATA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StrategyInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceBundle" (
    "id" TEXT NOT NULL,
    "strategyInstanceId" TEXT NOT NULL,
    "jobRunId" TEXT,
    "status" "EvidenceBundleStatus" NOT NULL DEFAULT 'PARTIAL',
    "sourceResults" JSONB NOT NULL DEFAULT '{}',
    "runAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceBundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceItem" (
    "id" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "reliabilityClass" "SourceReliabilityClass" NOT NULL,
    "status" "EvidenceItemStatus" NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "staleAt" TIMESTAMP(3),
    "symbols" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "url" TEXT,
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "payloadRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposedOrderPacket" (
    "id" TEXT NOT NULL,
    "strategyInstanceId" TEXT NOT NULL,
    "evidenceBundleId" TEXT,
    "jobRunId" TEXT,
    "status" "PacketStatus" NOT NULL DEFAULT 'DRAFT',
    "rationale" TEXT NOT NULL,
    "uncertaintyNote" TEXT,
    "agentRunMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProposedOrderPacket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposedOrder" (
    "id" TEXT NOT NULL,
    "packetId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" "OrderSide" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "orderType" "OrderType" NOT NULL,
    "limitPrice" DECIMAL(18,8),
    "environment" "BrokerEnvironment" NOT NULL,
    "brokerAccountId" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "evidenceItemIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "riskResult" JSONB,
    "status" "ProposedOrderStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProposedOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderRecord" (
    "id" TEXT NOT NULL,
    "proposedOrderId" TEXT NOT NULL,
    "brokerAccountId" TEXT NOT NULL,
    "brokerOrderId" TEXT,
    "symbol" TEXT NOT NULL,
    "side" "OrderSide" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "orderType" "OrderType" NOT NULL,
    "limitPrice" DECIMAL(18,8),
    "fillPrice" DECIMAL(18,8),
    "filledAt" TIMESTAMP(3),
    "environment" "BrokerEnvironment" NOT NULL,
    "status" "OrderRecordStatus" NOT NULL DEFAULT 'SUBMITTED',
    "stopProtected" BOOLEAN NOT NULL DEFAULT false,
    "trailingStopOrderId" TEXT,
    "stopPlacementError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "queue" TEXT NOT NULL,
    "strategyInstanceId" TEXT,
    "status" "JobRunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "outputRefs" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "severity" "NotificationSeverity" NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "strategyInstanceId" TEXT,
    "relatedId" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BrokerAccount_userId_environment_idx" ON "BrokerAccount"("userId", "environment");

-- CreateIndex
CREATE INDEX "BrokerAccount_credentialId_idx" ON "BrokerAccount"("credentialId");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyTemplate_kind_key" ON "StrategyTemplate"("kind");

-- CreateIndex
CREATE INDEX "StrategyInstance_userId_status_idx" ON "StrategyInstance"("userId", "status");

-- CreateIndex
CREATE INDEX "StrategyInstance_templateId_idx" ON "StrategyInstance"("templateId");

-- CreateIndex
CREATE INDEX "StrategyInstance_brokerAccountId_idx" ON "StrategyInstance"("brokerAccountId");

-- CreateIndex
CREATE INDEX "EvidenceBundle_strategyInstanceId_runAt_idx" ON "EvidenceBundle"("strategyInstanceId", "runAt");

-- CreateIndex
CREATE INDEX "EvidenceBundle_jobRunId_idx" ON "EvidenceBundle"("jobRunId");

-- CreateIndex
CREATE INDEX "EvidenceItem_bundleId_sourceId_idx" ON "EvidenceItem"("bundleId", "sourceId");

-- CreateIndex
CREATE INDEX "EvidenceItem_bundleId_status_idx" ON "EvidenceItem"("bundleId", "status");

-- CreateIndex
CREATE INDEX "ProposedOrderPacket_strategyInstanceId_status_idx" ON "ProposedOrderPacket"("strategyInstanceId", "status");

-- CreateIndex
CREATE INDEX "ProposedOrderPacket_evidenceBundleId_idx" ON "ProposedOrderPacket"("evidenceBundleId");

-- CreateIndex
CREATE INDEX "ProposedOrder_packetId_status_idx" ON "ProposedOrder"("packetId", "status");

-- CreateIndex
CREATE INDEX "ProposedOrder_symbol_environment_idx" ON "ProposedOrder"("symbol", "environment");

-- CreateIndex
CREATE UNIQUE INDEX "OrderRecord_proposedOrderId_key" ON "OrderRecord"("proposedOrderId");

-- CreateIndex
CREATE INDEX "OrderRecord_brokerAccountId_environment_createdAt_idx" ON "OrderRecord"("brokerAccountId", "environment", "createdAt");

-- CreateIndex
CREATE INDEX "OrderRecord_symbol_environment_createdAt_idx" ON "OrderRecord"("symbol", "environment", "createdAt");

-- CreateIndex
CREATE INDEX "OrderRecord_brokerOrderId_idx" ON "OrderRecord"("brokerOrderId");

-- CreateIndex
CREATE INDEX "JobRun_strategyInstanceId_status_idx" ON "JobRun"("strategyInstanceId", "status");

-- CreateIndex
CREATE INDEX "JobRun_jobType_status_startedAt_idx" ON "JobRun"("jobType", "status", "startedAt");

-- CreateIndex
CREATE INDEX "Notification_userId_read_createdAt_idx" ON "Notification"("userId", "read", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_kind_createdAt_idx" ON "Notification"("userId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "BrokerAccount" ADD CONSTRAINT "BrokerAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrokerAccount" ADD CONSTRAINT "BrokerAccount_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "Credential"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyInstance" ADD CONSTRAINT "StrategyInstance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyInstance" ADD CONSTRAINT "StrategyInstance_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "StrategyTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyInstance" ADD CONSTRAINT "StrategyInstance_brokerAccountId_fkey" FOREIGN KEY ("brokerAccountId") REFERENCES "BrokerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceBundle" ADD CONSTRAINT "EvidenceBundle_strategyInstanceId_fkey" FOREIGN KEY ("strategyInstanceId") REFERENCES "StrategyInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceBundle" ADD CONSTRAINT "EvidenceBundle_jobRunId_fkey" FOREIGN KEY ("jobRunId") REFERENCES "JobRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceItem" ADD CONSTRAINT "EvidenceItem_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "EvidenceBundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposedOrderPacket" ADD CONSTRAINT "ProposedOrderPacket_strategyInstanceId_fkey" FOREIGN KEY ("strategyInstanceId") REFERENCES "StrategyInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposedOrderPacket" ADD CONSTRAINT "ProposedOrderPacket_evidenceBundleId_fkey" FOREIGN KEY ("evidenceBundleId") REFERENCES "EvidenceBundle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposedOrderPacket" ADD CONSTRAINT "ProposedOrderPacket_jobRunId_fkey" FOREIGN KEY ("jobRunId") REFERENCES "JobRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposedOrder" ADD CONSTRAINT "ProposedOrder_packetId_fkey" FOREIGN KEY ("packetId") REFERENCES "ProposedOrderPacket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderRecord" ADD CONSTRAINT "OrderRecord_proposedOrderId_fkey" FOREIGN KEY ("proposedOrderId") REFERENCES "ProposedOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderRecord" ADD CONSTRAINT "OrderRecord_brokerAccountId_fkey" FOREIGN KEY ("brokerAccountId") REFERENCES "BrokerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRun" ADD CONSTRAINT "JobRun_strategyInstanceId_fkey" FOREIGN KEY ("strategyInstanceId") REFERENCES "StrategyInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_strategyInstanceId_fkey" FOREIGN KEY ("strategyInstanceId") REFERENCES "StrategyInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
