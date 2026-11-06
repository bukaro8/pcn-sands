-- Preserve the amount shown in each generated report even if the live PCN is
-- corrected later. Existing report entries remain valid with a null snapshot.
ALTER TABLE "ReportEntry" ADD COLUMN "paymentAmountPence" INTEGER;

ALTER TABLE "ReportEntry"
ADD CONSTRAINT "ReportEntry_paymentAmountPence_nonnegative"
CHECK ("paymentAmountPence" IS NULL OR "paymentAmountPence" >= 0);
