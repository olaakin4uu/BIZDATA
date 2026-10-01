
-- CreateTable
CREATE TABLE "ImportDraft" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerUserId" TEXT,
    "fileName" TEXT,
    "cipher" TEXT NOT NULL,
    "mapping" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "periodLabel" TEXT NOT NULL,
    "periodYear" INTEGER,
    "periodQuarter" INTEGER,
    "periodMonth" INTEGER,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "acceptRows" INTEGER NOT NULL DEFAULT 0,
    "rejectRows" INTEGER NOT NULL DEFAULT 0,
    "resultSubmissionId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TriageRecommendation" (
    "id" TEXT NOT NULL,
    "runId" TEXT,
    "caseId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "rationale" TEXT NOT NULL,
    "keyEvidence" JSONB,
    "risks" JSONB,
    "statutoryNotes" TEXT,
    "model" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "appliedTo" TEXT,
    "appliedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TriageRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportDraft_providerId_status_idx" ON "ImportDraft"("providerId", "status");

-- CreateIndex
CREATE INDEX "TriageRecommendation_caseId_status_idx" ON "TriageRecommendation"("caseId", "status");

-- CreateIndex
CREATE INDEX "TriageRecommendation_runId_idx" ON "TriageRecommendation"("runId");

-- CreateIndex
CREATE INDEX "TriageRecommendation_status_idx" ON "TriageRecommendation"("status");

