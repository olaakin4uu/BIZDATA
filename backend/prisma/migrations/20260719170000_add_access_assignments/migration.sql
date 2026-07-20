-- Need-to-know access grants for viewing/downloading raw taxpayer records.
-- A staff officer (enforced at the app layer to SUPER_ADMIN/ADMIN) is granted
-- access to a specific provider OR a specific case. Even SUPER_ADMIN must have
-- an active grant (self-assign, audited). Active while "revokedAt" IS NULL.

CREATE TABLE "access_assignments" (
    "id"           TEXT NOT NULL,
    "staffId"      TEXT NOT NULL,
    "providerId"   TEXT,
    "caseId"       TEXT,
    "reason"       TEXT NOT NULL,
    "grantedById"  TEXT NOT NULL,
    "selfAssigned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt"    TIMESTAMP(3),
    "revokedById"  TEXT,

    CONSTRAINT "access_assignments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "access_assignments_staffId_providerId_revokedAt_idx"
    ON "access_assignments" ("staffId", "providerId", "revokedAt");

CREATE INDEX "access_assignments_staffId_caseId_revokedAt_idx"
    ON "access_assignments" ("staffId", "caseId", "revokedAt");
