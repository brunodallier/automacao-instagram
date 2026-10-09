-- CreateEnum
CREATE TYPE "AutomationStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ERROR');

-- CreateEnum
CREATE TYPE "AutomationScope" AS ENUM ('GLOBAL', 'FUTURE_REELS', 'SPECIFIC_REELS');

-- CreateEnum
CREATE TYPE "AutomationStepKind" AS ENUM ('SEND_DM', 'BUTTONS', 'ADD_TAG', 'DELAY', 'PUBLIC_REPLY');

-- CreateTable
CREATE TABLE "Automation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "status" "AutomationStatus" NOT NULL DEFAULT 'DRAFT',
    "scope" "AutomationScope" NOT NULL DEFAULT 'GLOBAL',
    "lastExecutedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Automation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationKeyword" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "value" VARCHAR(40) NOT NULL,
    "normalizedValue" VARCHAR(40) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationKeyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationStep" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "AutomationStepKind" NOT NULL,
    "text" TEXT,
    "delaySeconds" INTEGER,
    "tagId" TEXT,
    "buttons" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AutomationStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationReel" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "externalId" VARCHAR(120) NOT NULL,
    "title" VARCHAR(160),
    "permalink" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationReel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Automation_workspaceId_updatedAt_idx" ON "Automation"("workspaceId", "updatedAt");

-- CreateIndex
CREATE INDEX "Automation_workspaceId_status_idx" ON "Automation"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "AutomationKeyword_automationId_createdAt_idx" ON "AutomationKeyword"("automationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationKeyword_automationId_normalizedValue_key" ON "AutomationKeyword"("automationId", "normalizedValue");

-- CreateIndex
CREATE INDEX "AutomationStep_automationId_position_idx" ON "AutomationStep"("automationId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationStep_automationId_position_key" ON "AutomationStep"("automationId", "position");

-- CreateIndex
CREATE INDEX "AutomationReel_automationId_idx" ON "AutomationReel"("automationId");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationReel_automationId_externalId_key" ON "AutomationReel"("automationId", "externalId");

-- AddForeignKey
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationKeyword" ADD CONSTRAINT "AutomationKeyword_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationStep" ADD CONSTRAINT "AutomationStep_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationStep" ADD CONSTRAINT "AutomationStep_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationReel" ADD CONSTRAINT "AutomationReel_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
