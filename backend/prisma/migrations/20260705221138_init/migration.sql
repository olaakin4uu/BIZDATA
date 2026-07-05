-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'ANALYST', 'AUDIT_OFFICER', 'DPO', 'READONLY');

-- CreateEnum
CREATE TYPE "ProviderType" AS ENUM ('BANK', 'FINTECH', 'PAYMENT_PROCESSOR', 'TELCO', 'FX_BUREAU', 'POS_AGGREGATOR', 'ECOMMERCE', 'INSURANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "ProviderStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING_ONBOARDING');

-- CreateEnum
CREATE TYPE "ProviderUserRole" AS ENUM ('PROVIDER_ADMIN', 'COMPLIANCE_OFFICER', 'DATA_OPERATOR');

-- CreateEnum
CREATE TYPE "TaxpayerType" AS ENUM ('INDIVIDUAL', 'CORPORATE', 'GOVERNMENT');

-- CreateEnum
CREATE TYPE "TaxpayerStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'BLACKLISTED', 'DECEASED');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('RECEIVED', 'VALIDATING', 'ACCEPTED', 'PARTIALLY_ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReportReviewStatus" AS ENUM ('PENDING_REVIEW', 'CLEARED', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "PortfolioScope" AS ENUM ('PROVIDER', 'PROVIDER_TYPE', 'SECTOR');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'NOTICE_ISSUED', 'OBJECTION', 'CONFIRMED', 'SETTLED', 'RECOVERED', 'DISMISSED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ReferralDirection" AS ENUM ('OUTBOUND', 'INBOUND');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('DRAFT', 'SENT', 'ACKNOWLEDGED', 'RECEIVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "MouStatus" AS ENUM ('DRAFT', 'SENT', 'EXECUTED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "ElevationStatus" AS ENUM ('PENDING', 'ACTIVE', 'DENIED', 'EXPIRED');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "address" TEXT,
    "logoUrl" TEXT,
    "themeColor" TEXT DEFAULT '#0f766e',
    "scanThreshold" DECIMAL(5,4) NOT NULL DEFAULT 0.20,
    "retentionYears" INTEGER NOT NULL DEFAULT 6,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "avatarUrl" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'READONLY',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecret" TEXT,
    "mfaRecoveryCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analyst_portfolios" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "scope" "PortfolioScope" NOT NULL,
    "targetValue" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analyst_portfolios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_providers" (
    "id" TEXT NOT NULL,
    "providerCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "providerType" "ProviderType" NOT NULL,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "address" TEXT,
    "status" "ProviderStatus" NOT NULL DEFAULT 'PENDING_ONBOARDING',
    "reportingFrequency" TEXT DEFAULT 'QUARTERLY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_provider_users" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "avatarUrl" TEXT,
    "role" "ProviderUserRole" NOT NULL DEFAULT 'COMPLIANCE_OFFICER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_provider_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taxpayers" (
    "id" TEXT NOT NULL,
    "ninEnc" TEXT,
    "ninIndex" TEXT,
    "bvnEnc" TEXT,
    "bvnIndex" TEXT,
    "tinEnc" TEXT,
    "tinIndex" TEXT,
    "cacRcNumber" TEXT,
    "type" "TaxpayerType" NOT NULL,
    "status" "TaxpayerStatus" NOT NULL DEFAULT 'ACTIVE',
    "firstName" TEXT,
    "lastName" TEXT,
    "middleName" TEXT,
    "businessName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "stateOfResidence" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "sector" TEXT,
    "businessType" TEXT,
    "identityVerifiedAt" TIMESTAMP(3),
    "identitySource" TEXT,
    "riskScore" INTEGER NOT NULL DEFAULT 100,
    "riskLevel" "RiskLevel" NOT NULL DEFAULT 'LOW',
    "riskComputedAt" TIMESTAMP(3),
    "riskFlags" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "taxpayers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "declared_incomes" (
    "id" TEXT NOT NULL,
    "taxpayerId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "assessableIncome" DECIMAL(18,2) NOT NULL,
    "source" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "declared_incomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_submissions" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "submittedByUserId" TEXT,
    "submittedByStaffId" TEXT,
    "periodLabel" TEXT NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "periodQuarter" INTEGER,
    "periodMonth" INTEGER,
    "fileName" TEXT,
    "fileSizeBytes" INTEGER,
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "acceptedCount" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "validationErrors" JSONB,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'RECEIVED',
    "receiptHash" TEXT,
    "resubmitDueAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_uploads" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "periodYear" INTEGER,
    "periodQuarter" INTEGER,
    "periodMonth" INTEGER,
    "fileName" TEXT NOT NULL,
    "totalParts" INTEGER NOT NULL,
    "expectedChecksum" TEXT,
    "totalBytes" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "submissionId" TEXT,
    "submittedByStaffId" TEXT,
    "submittedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "submission_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_upload_parts" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "partNumber" INTEGER NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submission_upload_parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_records" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerType" "ProviderType" NOT NULL,
    "taxpayerId" TEXT,
    "accountNumber" TEXT,
    "bvn" TEXT,
    "nin" TEXT,
    "phoneNumber" TEXT,
    "walletId" TEXT,
    "merchantId" TEXT,
    "accountName" TEXT,
    "periodLabel" TEXT NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "matchMethod" TEXT,
    "matchConfidence" DECIMAL(3,2),
    "accountIndex" TEXT,
    "totalInflow" DECIMAL(18,2),
    "totalOutflow" DECIMAL(18,2),
    "openingBalance" DECIMAL(18,2),
    "closingBalance" DECIMAL(18,2),
    "transactionCount" INTEGER,
    "payload" JSONB,
    "flaggedAsUnderdeclared" BOOLEAN NOT NULL DEFAULT false,
    "declaredIncome" DECIMAL(18,2),
    "discrepancyAmount" DECIMAL(18,2),
    "discrepancyPct" DECIMAL(8,4),
    "flaggedAt" TIMESTAMP(3),
    "reviewStatus" "ReportReviewStatus" DEFAULT 'PENDING_REVIEW',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "underdeclaration_scans" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "threshold" DECIMAL(5,4) NOT NULL,
    "providerTypes" JSONB,
    "totalScanned" INTEGER NOT NULL DEFAULT 0,
    "totalFlagged" INTEGER NOT NULL DEFAULT 0,
    "totalRecovered" DECIMAL(18,2),
    "totalEstimatedTax" DECIMAL(18,2),
    "engineVersion" TEXT,
    "status" "ScanStatus" NOT NULL DEFAULT 'RUNNING',
    "errorMessage" TEXT,
    "startedById" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "underdeclaration_scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "underdeclaration_cases" (
    "id" TEXT NOT NULL,
    "taxpayerId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "scanId" TEXT,
    "observedIncome" DECIMAL(18,2) NOT NULL,
    "declaredIncome" DECIMAL(18,2) NOT NULL,
    "discrepancyAmount" DECIMAL(18,2) NOT NULL,
    "discrepancyPct" DECIMAL(8,4) NOT NULL,
    "estimatedTaxDue" DECIMAL(18,2) NOT NULL,
    "confidence" DECIMAL(3,2) NOT NULL,
    "agentScore" DECIMAL(3,2),
    "reasons" JSONB,
    "providerCount" INTEGER NOT NULL DEFAULT 0,
    "engineVersion" TEXT,
    "status" "CaseStatus" NOT NULL DEFAULT 'OPEN',
    "riskLevel" "RiskLevel" NOT NULL DEFAULT 'MEDIUM',
    "assignedToId" TEXT,
    "recoveredAmount" DECIMAL(18,2),
    "assessedTax" DECIMAL(18,2),
    "penaltyAmount" DECIMAL(18,2),
    "assessedTotal" DECIMAL(18,2),
    "assessmentBasis" JSONB,
    "demandNoticeRef" TEXT,
    "caseAccessToken" TEXT,
    "noticeIssuedAt" TIMESTAMP(3),
    "objectionDueAt" TIMESTAMP(3),
    "authorityResponseDueAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "statutoryVersion" INTEGER,
    "objectionGrounds" TEXT,
    "objectionFiledAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "underdeclaration_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_documents" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "fileSizeBytes" INTEGER,
    "extractedText" TEXT,
    "extractionSource" TEXT,
    "declaredIncome" DECIMAL(18,2),
    "variance" DECIMAL(8,4),
    "consistent" BOOLEAN,
    "reconcileNote" TEXT,
    "assetDisposals" DECIMAL(18,2),
    "cgtAssessed" DECIMAL(18,2),
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "statutory_configs" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "reportingDueDays" INTEGER NOT NULL DEFAULT 15,
    "objectionWindowDays" INTEGER NOT NULL DEFAULT 30,
    "authorityResponseDays" INTEGER NOT NULL DEFAULT 90,
    "latePaymentPenaltyRate" DECIMAL(5,4) NOT NULL DEFAULT 0.10,
    "citRate" DECIMAL(5,4) NOT NULL DEFAULT 0.30,
    "citSmallCoThreshold" DECIMAL(18,2) NOT NULL DEFAULT 50000000,
    "cgtRate" DECIMAL(5,4) NOT NULL DEFAULT 0.10,
    "defaultScanThreshold" DECIMAL(5,4) NOT NULL DEFAULT 0.20,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "statutory_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_api_keys" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY['TAXPAYER_NOTICES']::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sector_thresholds" (
    "id" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "threshold" DECIMAL(5,4) NOT NULL,
    "fairnessPassed" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sector_thresholds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cross_state_referrals" (
    "id" TEXT NOT NULL,
    "taxpayerId" TEXT,
    "direction" "ReferralDirection" NOT NULL,
    "fromAuthority" TEXT NOT NULL,
    "toAuthority" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "basis" TEXT NOT NULL DEFAULT 'JRBA 2025 s.15',
    "year" INTEGER,
    "payload" JSONB,
    "status" "ReferralStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cross_state_referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "targetRole" TEXT,
    "targetUserId" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_mous" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "status" "MouStatus" NOT NULL DEFAULT 'DRAFT',
    "channel" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "signedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_mous_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_signals" (
    "id" TEXT NOT NULL,
    "taxpayerId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "agentKey" TEXT NOT NULL,
    "score" DECIMAL(3,2) NOT NULL,
    "severity" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_elevations" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'PII',
    "reason" TEXT NOT NULL,
    "status" "ElevationStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "access_elevations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "staffId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "hashChainPrev" TEXT,
    "hashChainCurr" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_schemas" (
    "id" TEXT NOT NULL,
    "providerType" "ProviderType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "columns" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_schemas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "analyst_portfolios_staffId_idx" ON "analyst_portfolios"("staffId");

-- CreateIndex
CREATE UNIQUE INDEX "analyst_portfolios_scope_targetValue_key" ON "analyst_portfolios"("scope", "targetValue");

-- CreateIndex
CREATE UNIQUE INDEX "data_providers_providerCode_key" ON "data_providers"("providerCode");

-- CreateIndex
CREATE UNIQUE INDEX "data_provider_users_email_key" ON "data_provider_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "taxpayers_ninIndex_key" ON "taxpayers"("ninIndex");

-- CreateIndex
CREATE UNIQUE INDEX "taxpayers_bvnIndex_key" ON "taxpayers"("bvnIndex");

-- CreateIndex
CREATE UNIQUE INDEX "taxpayers_tinIndex_key" ON "taxpayers"("tinIndex");

-- CreateIndex
CREATE UNIQUE INDEX "taxpayers_cacRcNumber_key" ON "taxpayers"("cacRcNumber");

-- CreateIndex
CREATE UNIQUE INDEX "declared_incomes_taxpayerId_year_key" ON "declared_incomes"("taxpayerId", "year");

-- CreateIndex
CREATE INDEX "submission_uploads_providerId_idx" ON "submission_uploads"("providerId");

-- CreateIndex
CREATE INDEX "submission_upload_parts_uploadId_idx" ON "submission_upload_parts"("uploadId");

-- CreateIndex
CREATE UNIQUE INDEX "submission_upload_parts_uploadId_partNumber_key" ON "submission_upload_parts"("uploadId", "partNumber");

-- CreateIndex
CREATE INDEX "data_records_taxpayerId_periodYear_idx" ON "data_records"("taxpayerId", "periodYear");

-- CreateIndex
CREATE INDEX "data_records_providerId_periodLabel_idx" ON "data_records"("providerId", "periodLabel");

-- CreateIndex
CREATE INDEX "data_records_providerId_periodLabel_accountIndex_idx" ON "data_records"("providerId", "periodLabel", "accountIndex");

-- CreateIndex
CREATE INDEX "data_records_flaggedAsUnderdeclared_reviewStatus_idx" ON "data_records"("flaggedAsUnderdeclared", "reviewStatus");

-- CreateIndex
CREATE UNIQUE INDEX "underdeclaration_cases_caseAccessToken_key" ON "underdeclaration_cases"("caseAccessToken");

-- CreateIndex
CREATE INDEX "underdeclaration_cases_status_idx" ON "underdeclaration_cases"("status");

-- CreateIndex
CREATE INDEX "underdeclaration_cases_riskLevel_idx" ON "underdeclaration_cases"("riskLevel");

-- CreateIndex
CREATE UNIQUE INDEX "underdeclaration_cases_taxpayerId_year_key" ON "underdeclaration_cases"("taxpayerId", "year");

-- CreateIndex
CREATE INDEX "case_documents_caseId_idx" ON "case_documents"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "statutory_configs_version_key" ON "statutory_configs"("version");

-- CreateIndex
CREATE INDEX "statutory_configs_isActive_idx" ON "statutory_configs"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "integration_api_keys_keyHash_key" ON "integration_api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "integration_api_keys_isActive_idx" ON "integration_api_keys"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "sector_thresholds_sector_key" ON "sector_thresholds"("sector");

-- CreateIndex
CREATE INDEX "cross_state_referrals_direction_status_idx" ON "cross_state_referrals"("direction", "status");

-- CreateIndex
CREATE INDEX "notifications_read_createdAt_idx" ON "notifications"("read", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_targetUserId_read_idx" ON "notifications"("targetUserId", "read");

-- CreateIndex
CREATE UNIQUE INDEX "bank_mous_providerId_key" ON "bank_mous"("providerId");

-- CreateIndex
CREATE INDEX "risk_signals_agentKey_year_idx" ON "risk_signals"("agentKey", "year");

-- CreateIndex
CREATE UNIQUE INDEX "risk_signals_taxpayerId_year_agentKey_key" ON "risk_signals"("taxpayerId", "year", "agentKey");

-- CreateIndex
CREATE INDEX "access_elevations_staffId_status_idx" ON "access_elevations"("staffId", "status");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_actorType_actorId_idx" ON "audit_logs"("actorType", "actorId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "provider_schemas_providerType_key" ON "provider_schemas"("providerType");

-- AddForeignKey
ALTER TABLE "analyst_portfolios" ADD CONSTRAINT "analyst_portfolios_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_provider_users" ADD CONSTRAINT "data_provider_users_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "data_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declared_incomes" ADD CONSTRAINT "declared_incomes_taxpayerId_fkey" FOREIGN KEY ("taxpayerId") REFERENCES "taxpayers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_submissions" ADD CONSTRAINT "data_submissions_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "data_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_submissions" ADD CONSTRAINT "data_submissions_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "data_provider_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_uploads" ADD CONSTRAINT "submission_uploads_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "data_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_upload_parts" ADD CONSTRAINT "submission_upload_parts_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "submission_uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_records" ADD CONSTRAINT "data_records_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "data_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_records" ADD CONSTRAINT "data_records_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "data_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_records" ADD CONSTRAINT "data_records_taxpayerId_fkey" FOREIGN KEY ("taxpayerId") REFERENCES "taxpayers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_records" ADD CONSTRAINT "data_records_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "underdeclaration_scans" ADD CONSTRAINT "underdeclaration_scans_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "underdeclaration_cases" ADD CONSTRAINT "underdeclaration_cases_taxpayerId_fkey" FOREIGN KEY ("taxpayerId") REFERENCES "taxpayers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "underdeclaration_cases" ADD CONSTRAINT "underdeclaration_cases_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "underdeclaration_scans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "underdeclaration_cases" ADD CONSTRAINT "underdeclaration_cases_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_documents" ADD CONSTRAINT "case_documents_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "underdeclaration_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cross_state_referrals" ADD CONSTRAINT "cross_state_referrals_taxpayerId_fkey" FOREIGN KEY ("taxpayerId") REFERENCES "taxpayers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_mous" ADD CONSTRAINT "bank_mous_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "data_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_signals" ADD CONSTRAINT "risk_signals_taxpayerId_fkey" FOREIGN KEY ("taxpayerId") REFERENCES "taxpayers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_elevations" ADD CONSTRAINT "access_elevations_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_elevations" ADD CONSTRAINT "access_elevations_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
