ALTER TABLE "Pcn"
ADD COLUMN "discountedAmountPence" INTEGER,
ADD COLUMN "fullPenaltyAmountPence" INTEGER,
ADD COLUMN "discountDeadline" DATE,
ADD COLUMN "fullPaymentDeadline" DATE,
ADD COLUMN "discountPeriodDays" INTEGER,
ADD COLUMN "discountPeriodStartDate" DATE;
