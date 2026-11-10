-- Preserve optional decision notes per challenge and the follow-up date shown in
-- historical report snapshots. Both columns are additive and nullable.
ALTER TABLE "Challenge" ADD COLUMN "decisionNotes" TEXT;
ALTER TABLE "ReportEntry" ADD COLUMN "nextStatusCheckDate" DATE;
