-- Four-eyes grant tokens for unlocking raw taxpayer records. An assigned officer
-- requests access; a SUPER_ADMIN approves (mints a one-time token, hash stored);
-- the officer redeems it with password + token to unlock, reusable for the work
-- session window. Fully audited.

CREATE TYPE "GrantTokenStatus" AS ENUM ('PENDING', 'APPROVED', 'REDEEMED', 'REVOKED', 'EXPIRED');

CREATE TABLE "access_grant_tokens" (
    "id"               TEXT NOT NULL,
    "staffId"          TEXT NOT NULL,
    "providerId"       TEXT,
    "caseId"           TEXT,
    "reason"           TEXT NOT NULL,
    "status"           "GrantTokenStatus" NOT NULL DEFAULT 'PENDING',
    "tokenHash"        TEXT,
    "requestedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedById"     TEXT,
    "approvedAt"       TIMESTAMP(3),
    "redeemExpiresAt"  TIMESTAMP(3),
    "redeemedAt"       TIMESTAMP(3),
    "sessionExpiresAt" TIMESTAMP(3),
    "revokedAt"        TIMESTAMP(3),
    "revokedById"      TEXT,

    CONSTRAINT "access_grant_tokens_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "access_grant_tokens_staffId_status_idx" ON "access_grant_tokens" ("staffId", "status");
CREATE INDEX "access_grant_tokens_tokenHash_idx" ON "access_grant_tokens" ("tokenHash");
