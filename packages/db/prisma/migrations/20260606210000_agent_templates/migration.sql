-- CreateEnum
CREATE TYPE "AgentCategory" AS ENUM ('ANALYST', 'RESEARCHER', 'MANAGER', 'TRADER', 'RISK_DEBATOR');

-- CreateEnum
CREATE TYPE "AgentSpecialization" AS ENUM ('MARKET', 'SENTIMENT', 'NEWS', 'FUNDAMENTALS', 'BULL', 'BEAR', 'RESEARCH_MANAGER', 'PORTFOLIO_MANAGER', 'TRADER', 'AGGRESSIVE', 'CONSERVATIVE', 'NEUTRAL');

-- CreateTable
CREATE TABLE "AgentTemplate" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "AgentCategory" NOT NULL,
    "role" TEXT NOT NULL,
    "specialization" "AgentSpecialization" NOT NULL,
    "description" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "userPromptTemplate" TEXT NOT NULL,
    "outputType" TEXT NOT NULL,
    "variables" JSONB NOT NULL,
    "toolRefs" JSONB NOT NULL,
    "defaultDebateSide" TEXT,
    "isBuiltin" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentTemplate_category_idx" ON "AgentTemplate"("category");

-- CreateIndex
CREATE INDEX "AgentTemplate_userId_idx" ON "AgentTemplate"("userId");

-- CreateIndex
CREATE INDEX "AgentTemplate_isBuiltin_idx" ON "AgentTemplate"("isBuiltin");

-- CreateIndex
CREATE UNIQUE INDEX "AgentTemplate_slug_userId_key" ON "AgentTemplate"("slug", "userId");

-- AddForeignKey
ALTER TABLE "AgentTemplate" ADD CONSTRAINT "AgentTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
