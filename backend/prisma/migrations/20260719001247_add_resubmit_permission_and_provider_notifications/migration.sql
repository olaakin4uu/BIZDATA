-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "targetProviderId" TEXT;

-- CreateTable
CREATE TABLE "resubmit_permissions" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "reason" TEXT,
    "grantedById" TEXT NOT NULL,
    "consumed" BOOLEAN NOT NULL DEFAULT false,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resubmit_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "resubmit_permissions_providerId_periodLabel_consumed_idx" ON "resubmit_permissions"("providerId", "periodLabel", "consumed");

-- CreateIndex
CREATE INDEX "notifications_targetProviderId_read_idx" ON "notifications"("targetProviderId", "read");
