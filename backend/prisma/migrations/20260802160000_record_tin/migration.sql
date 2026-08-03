-- TIN as reported on a return.
--
-- Banks do supply TIN (nine of the KIRS bank-file layouts map a TIN column), but
-- nothing persisted it: submissions fed row.tin to resolveTaxpayer purely as a
-- lookup key and dropped it. A TIN supplied for a taxpayer not yet on the
-- register was therefore lost, and per-return TIN coverage could not be measured.
--
-- Encrypted like the other identifiers (AES-GCM, random IV), with a deterministic
-- blind index alongside so it can still be grouped and matched in SQL.
ALTER TABLE "data_records" ADD COLUMN "tin" TEXT;
ALTER TABLE "data_records" ADD COLUMN "tinIndex" TEXT;

CREATE INDEX "data_records_tinIndex_periodYear_idx" ON "data_records"("tinIndex", "periodYear");
