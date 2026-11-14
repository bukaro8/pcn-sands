-- Allow immutable, independently generated versions for the same report period.
DROP INDEX IF EXISTS "ReportHistory_type_periodStart_periodEnd_key";

-- Snapshot period statistics so older PDFs remain unchanged when live cases move on.
ALTER TABLE "ReportEntry"
ADD COLUMN "submittedInPeriod" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "acceptedInPeriod" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "rejectedInPeriod" BOOLEAN NOT NULL DEFAULT false;

UPDATE "ReportEntry" entry
SET
  "submittedInPeriod" = EXISTS (
    SELECT 1 FROM "Challenge" challenge
    WHERE challenge."pcnId" = entry."pcnId"
      AND challenge."submissionDate" BETWEEN report."periodStart" AND report."periodEnd"
  ),
  "acceptedInPeriod" = EXISTS (
    SELECT 1 FROM "Challenge" challenge
    WHERE challenge."pcnId" = entry."pcnId"
      AND challenge."outcome" = 'ACCEPTED'
      AND challenge."decisionDate" BETWEEN report."periodStart" AND report."periodEnd"
  ),
  "rejectedInPeriod" = EXISTS (
    SELECT 1 FROM "Challenge" challenge
    WHERE challenge."pcnId" = entry."pcnId"
      AND challenge."outcome" = 'REJECTED'
      AND challenge."decisionDate" BETWEEN report."periodStart" AND report."periodEnd"
  )
FROM "ReportHistory" report
WHERE report."id" = entry."reportId";

-- Bind an automated run to the exact snapshot it created. This retains retry
-- idempotency without imposing uniqueness on manual report generation.
ALTER TABLE "JobExecution" ADD COLUMN "reportId" TEXT;
CREATE UNIQUE INDEX "JobExecution_reportId_key" ON "JobExecution"("reportId");
ALTER TABLE "JobExecution"
ADD CONSTRAINT "JobExecution_reportId_fkey"
FOREIGN KEY ("reportId") REFERENCES "ReportHistory"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
