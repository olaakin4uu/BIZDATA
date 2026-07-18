-- CreateTable
CREATE TABLE "tax_payments" (
    "id" TEXT NOT NULL,
    "taxpayerId" TEXT NOT NULL,
    "taxType" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "period" TEXT,
    "amountPaid" DECIMAL(18,2) NOT NULL,
    "reference" TEXT,
    "source" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tax_payments_taxpayerId_year_idx" ON "tax_payments"("taxpayerId", "year");

-- CreateIndex
CREATE INDEX "tax_payments_taxpayerId_taxType_year_idx" ON "tax_payments"("taxpayerId", "taxType", "year");

-- AddForeignKey
ALTER TABLE "tax_payments" ADD CONSTRAINT "tax_payments_taxpayerId_fkey" FOREIGN KEY ("taxpayerId") REFERENCES "taxpayers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
