-- AlterTable
ALTER TABLE "taxpayers" ADD COLUMN     "isLimitedLiability" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "llcSource" TEXT;

-- AlterTable
ALTER TABLE "underdeclaration_cases" ADD COLUMN     "altTaxDue" DECIMAL(18,2),
ADD COLUMN     "altTaxRate" DECIMAL(5,4),
ADD COLUMN     "taxBasis" TEXT;

-- Backfill: flag existing taxpayers whose business name carries a limited-company
-- suffix (LTD / Limited / PLC, with or without a trailing full stop). Mirrors
-- isLlcName() in the detection engine. Word-boundary anchored so "Unlimited" and
-- "Limitless" don't match. Staff can override any of these afterwards.
UPDATE "taxpayers"
SET "isLimitedLiability" = true,
    "llcSource" = 'NAME_SUFFIX'
WHERE "businessName" ~* '\m(ltd|limited|plc)\M\.?';

-- CreateTable
CREATE TABLE "iris_conversations" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "iris_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iris_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "text" TEXT,
    "blocks" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "iris_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iris_drafts" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "conversationId" TEXT,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "summary" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "resultRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "iris_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iris_exports" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "draftId" TEXT,
    "fileName" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "cipher" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "downloadedAt" TIMESTAMP(3),

    CONSTRAINT "iris_exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iris_usage" (
    "id" TEXT NOT NULL,
    "staffId" TEXT,
    "conversationId" TEXT,
    "feature" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsdMicros" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "iris_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "iris_conversations_staffId_updatedAt_idx" ON "iris_conversations"("staffId", "updatedAt");

-- CreateIndex
CREATE INDEX "iris_messages_conversationId_createdAt_idx" ON "iris_messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "iris_drafts_staffId_status_idx" ON "iris_drafts"("staffId", "status");

-- CreateIndex
CREATE INDEX "iris_exports_staffId_createdAt_idx" ON "iris_exports"("staffId", "createdAt");

-- CreateIndex
CREATE INDEX "iris_usage_createdAt_idx" ON "iris_usage"("createdAt");

-- AddForeignKey
ALTER TABLE "iris_messages" ADD CONSTRAINT "iris_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "iris_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
