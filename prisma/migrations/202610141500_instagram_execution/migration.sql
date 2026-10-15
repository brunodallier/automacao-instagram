-- CreateTable
CREATE TABLE "InstagramAutomationState" (
    "automationId" TEXT NOT NULL,
    "activatedAt" TIMESTAMPTZ(3) NOT NULL,
    "publicReplyCursor" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InstagramAutomationState_pkey" PRIMARY KEY ("automationId")
);

-- CreateTable
CREATE TABLE "InstagramWebhookEvent" (
    "id" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "eventKey" VARCHAR(64) NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "data" JSONB NOT NULL,
    "processedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstagramWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstagramContact" (
    "id" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "recipientId" VARCHAR(120) NOT NULL,
    "lastInteractionAt" TIMESTAMPTZ(3),
    "interactionKind" VARCHAR(32),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstagramContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstagramContactTag" (
    "contactId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstagramContactTag_pkey" PRIMARY KEY ("contactId","tagId")
);

-- CreateTable
CREATE TABLE "InstagramAutomationRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "automationId" TEXT,
    "automationUpdatedAt" TIMESTAMPTZ(3) NOT NULL,
    "commentId" VARCHAR(120) NOT NULL,
    "mediaId" VARCHAR(120) NOT NULL,
    "commentCreatedAt" TIMESTAMPTZ(3) NOT NULL,
    "recipientId" VARCHAR(120),
    "snapshot" JSONB NOT NULL,
    "state" VARCHAR(32) NOT NULL DEFAULT 'RUNNING',
    "initialStatus" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    "cursor" INTEGER NOT NULL DEFAULT 0,
    "pendingMessage" JSONB,
    "pendingPath" VARCHAR(120),
    "resumeAt" TIMESTAMPTZ(3),
    "pendingTags" JSONB NOT NULL,
    "publicText" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InstagramAutomationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstagramOutbound" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "operationKey" VARCHAR(200) NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "body" JSONB NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'PLANNED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "dispatchToken" VARCHAR(64),
    "dispatchedAt" TIMESTAMPTZ(3),
    "acceptedAt" TIMESTAMPTZ(3),
    "remoteId" VARCHAR(300),
    "recipientId" VARCHAR(120),
    "errorCategory" VARCHAR(40),
    "errorCode" INTEGER,
    "errorSubcode" INTEGER,
    "fallbackApproved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstagramOutbound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstagramContinuation" (
    "id" TEXT NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "outboundId" TEXT NOT NULL,
    "recipientId" VARCHAR(120) NOT NULL,
    "message" JSONB NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),

    CONSTRAINT "InstagramContinuation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstagramJob" (
    "id" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "eventId" TEXT,
    "runId" TEXT,
    "outboundId" TEXT,
    "dedupeKey" VARCHAR(200) NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "state" VARCHAR(16) NOT NULL DEFAULT 'READY',
    "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseToken" VARCHAR(64),
    "leaseUntil" TIMESTAMPTZ(3),
    "lastError" VARCHAR(40),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstagramJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstagramActivity" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "detail" VARCHAR(80),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstagramActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstagramWorkerState" (
    "socialAccountId" TEXT NOT NULL,
    "heartbeatAt" TIMESTAMPTZ(3) NOT NULL,
    "nextSendAt" TIMESTAMPTZ(3) NOT NULL,
    "mode" VARCHAR(16) NOT NULL,

    CONSTRAINT "InstagramWorkerState_pkey" PRIMARY KEY ("socialAccountId")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstagramWebhookEvent_eventKey_key" ON "InstagramWebhookEvent"("eventKey");

-- CreateIndex
CREATE INDEX "InstagramWebhookEvent_socialAccountId_createdAt_idx" ON "InstagramWebhookEvent"("socialAccountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InstagramContact_socialAccountId_recipientId_key" ON "InstagramContact"("socialAccountId", "recipientId");

-- CreateIndex
CREATE INDEX "InstagramAutomationRun_workspaceId_createdAt_idx" ON "InstagramAutomationRun"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "InstagramAutomationRun_socialAccountId_recipientId_state_idx" ON "InstagramAutomationRun"("socialAccountId", "recipientId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "InstagramAutomationRun_socialAccountId_commentId_key" ON "InstagramAutomationRun"("socialAccountId", "commentId");

-- CreateIndex
CREATE UNIQUE INDEX "InstagramOutbound_operationKey_key" ON "InstagramOutbound"("operationKey");

-- CreateIndex
CREATE INDEX "InstagramOutbound_runId_status_idx" ON "InstagramOutbound"("runId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InstagramContinuation_tokenHash_key" ON "InstagramContinuation"("tokenHash");

-- CreateIndex
CREATE INDEX "InstagramContinuation_outboundId_idx" ON "InstagramContinuation"("outboundId");

-- CreateIndex
CREATE UNIQUE INDEX "InstagramJob_dedupeKey_key" ON "InstagramJob"("dedupeKey");

-- CreateIndex
CREATE INDEX "InstagramJob_state_availableAt_idx" ON "InstagramJob"("state", "availableAt");

-- CreateIndex
CREATE INDEX "InstagramJob_leaseUntil_idx" ON "InstagramJob"("leaseUntil");

-- CreateIndex
CREATE INDEX "InstagramActivity_runId_createdAt_idx" ON "InstagramActivity"("runId", "createdAt");

-- AddForeignKey
ALTER TABLE "InstagramAutomationState" ADD CONSTRAINT "InstagramAutomationState_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramWebhookEvent" ADD CONSTRAINT "InstagramWebhookEvent_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramContact" ADD CONSTRAINT "InstagramContact_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramContactTag" ADD CONSTRAINT "InstagramContactTag_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "InstagramContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramContactTag" ADD CONSTRAINT "InstagramContactTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramAutomationRun" ADD CONSTRAINT "InstagramAutomationRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramAutomationRun" ADD CONSTRAINT "InstagramAutomationRun_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramAutomationRun" ADD CONSTRAINT "InstagramAutomationRun_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramOutbound" ADD CONSTRAINT "InstagramOutbound_runId_fkey" FOREIGN KEY ("runId") REFERENCES "InstagramAutomationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramContinuation" ADD CONSTRAINT "InstagramContinuation_outboundId_fkey" FOREIGN KEY ("outboundId") REFERENCES "InstagramOutbound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramJob" ADD CONSTRAINT "InstagramJob_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramJob" ADD CONSTRAINT "InstagramJob_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "InstagramWebhookEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramJob" ADD CONSTRAINT "InstagramJob_runId_fkey" FOREIGN KEY ("runId") REFERENCES "InstagramAutomationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramJob" ADD CONSTRAINT "InstagramJob_outboundId_fkey" FOREIGN KEY ("outboundId") REFERENCES "InstagramOutbound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramActivity" ADD CONSTRAINT "InstagramActivity_runId_fkey" FOREIGN KEY ("runId") REFERENCES "InstagramAutomationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramWorkerState" ADD CONSTRAINT "InstagramWorkerState_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
