CREATE TABLE "InvoiceEvidence" (
  "id" TEXT NOT NULL,
  "pcnId" TEXT NOT NULL,
  "reference" TEXT,
  "invoiceDate" DATE,
  "deliveryDate" DATE,
  "deliveryAddress" TEXT,
  "billingAddress" TEXT,
  "recipient" TEXT,
  "supplier" TEXT,
  "description" TEXT,
  "deliveryTime" TEXT,
  "otherFacts" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InvoiceEvidence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InvoiceEvidence_pcnId_key" ON "InvoiceEvidence"("pcnId");
ALTER TABLE "InvoiceEvidence" ADD CONSTRAINT "InvoiceEvidence_pcnId_fkey" FOREIGN KEY ("pcnId") REFERENCES "Pcn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
