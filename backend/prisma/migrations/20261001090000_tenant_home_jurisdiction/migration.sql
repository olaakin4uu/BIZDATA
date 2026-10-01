-- Home jurisdiction for JRB Act 2025 §15 cross-state referrals.
-- Previously hardcoded to FCT-IRS in cross-state.service.ts, so every taxpayer of
-- any other authority was classed as a non-resident and offered up for referral.
ALTER TABLE "tenants" ADD COLUMN "homeAuthority" TEXT;
ALTER TABLE "tenants" ADD COLUMN "homeStates" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "tenants" ADD COLUMN "homeTerritoryLabel" TEXT;
