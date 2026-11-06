-- Payment amounts are optional because historic records may not include a
-- reliably verified amount. Integer pence avoids floating-point rounding.
ALTER TABLE "Pcn" ADD COLUMN "paymentAmountPence" INTEGER;

ALTER TABLE "Pcn"
ADD CONSTRAINT "Pcn_paymentAmountPence_nonnegative"
CHECK ("paymentAmountPence" IS NULL OR "paymentAmountPence" >= 0);
