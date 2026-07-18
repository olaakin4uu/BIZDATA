-- AlterTable
ALTER TABLE "statutory_configs" ADD COLUMN     "reportingThresholdCorporate" DECIMAL(18,2) NOT NULL DEFAULT 250000000,
ADD COLUMN     "reportingThresholdIndividual" DECIMAL(18,2) NOT NULL DEFAULT 50000000;
