-- Deterministic blind indexes of the identifiers a provider reported on a data
-- record. `bvn`/`nin` are AES-GCM ciphertext with a random IV, so they cannot be
-- grouped or joined in SQL; these HMACs can, which is what the account-linkage
-- report needs to find one customer holding accounts across several providers.
ALTER TABLE "data_records" ADD COLUMN "bvnIndex" TEXT;
ALTER TABLE "data_records" ADD COLUMN "ninIndex" TEXT;

CREATE INDEX "data_records_bvnIndex_periodYear_idx" ON "data_records"("bvnIndex", "periodYear");
CREATE INDEX "data_records_ninIndex_periodYear_idx" ON "data_records"("ninIndex", "periodYear");
