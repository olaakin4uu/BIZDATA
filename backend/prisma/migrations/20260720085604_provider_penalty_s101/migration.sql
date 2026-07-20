-- AlterTable
ALTER TABLE "statutory_configs" ADD COLUMN     "providerPenaltyFirstMonth" DECIMAL(18,2) NOT NULL DEFAULT 100000,
ADD COLUMN     "providerPenaltyPerMonth" DECIMAL(18,2) NOT NULL DEFAULT 50000;

-- CreateTable
CREATE TABLE "provider_penalties" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "monthsInDefault" INTEGER NOT NULL,
    "firstMonthAmount" DECIMAL(18,2) NOT NULL,
    "perMonthAmount" DECIMAL(18,2) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "basis" JSONB,
    "statutoryVersion" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ASSESSED',
    "noticeRef" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_penalties_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "provider_penalties_providerId_idx" ON "provider_penalties"("providerId");

-- CreateIndex
CREATE INDEX "provider_penalties_status_idx" ON "provider_penalties"("status");

-- CreateIndex
CREATE UNIQUE INDEX "provider_penalties_providerId_periodLabel_key" ON "provider_penalties"("providerId", "periodLabel");

-- AddForeignKey
ALTER TABLE "provider_penalties" ADD CONSTRAINT "provider_penalties_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "data_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
