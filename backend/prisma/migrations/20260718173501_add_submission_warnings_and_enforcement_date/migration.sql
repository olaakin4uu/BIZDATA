-- AlterTable
ALTER TABLE "data_submissions" ADD COLUMN     "warningCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "warnings" JSONB;

-- AlterTable
ALTER TABLE "statutory_configs" ADD COLUMN     "fieldEnforcementDate" TIMESTAMP(3);
