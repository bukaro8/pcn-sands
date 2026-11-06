CREATE TYPE "ChecklistTaskType" AS ENUM ('PREPARE_CHALLENGE', 'CHALLENGE_STATUS_CHECK', 'REVIEW_DECISION');

ALTER TYPE "JobType" ADD VALUE 'DAILY_CHECKLIST';

CREATE TABLE "ChecklistTask" (
  "id" TEXT NOT NULL,
  "taskKey" TEXT NOT NULL,
  "type" "ChecklistTaskType" NOT NULL,
  "pcnId" TEXT NOT NULL,
  "challengeId" TEXT,
  "reminderId" TEXT,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChecklistTask_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChecklistTask_taskKey_key" ON "ChecklistTask"("taskKey");
CREATE INDEX "ChecklistTask_completedAt_dueAt_idx" ON "ChecklistTask"("completedAt", "dueAt");
CREATE INDEX "ChecklistTask_pcnId_type_idx" ON "ChecklistTask"("pcnId", "type");

ALTER TABLE "ChecklistTask" ADD CONSTRAINT "ChecklistTask_pcnId_fkey" FOREIGN KEY ("pcnId") REFERENCES "Pcn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChecklistTask" ADD CONSTRAINT "ChecklistTask_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChecklistTask" ADD CONSTRAINT "ChecklistTask_reminderId_fkey" FOREIGN KEY ("reminderId") REFERENCES "Reminder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
