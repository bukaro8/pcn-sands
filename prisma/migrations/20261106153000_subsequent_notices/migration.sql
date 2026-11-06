ALTER TYPE "ChecklistTaskType" ADD VALUE 'REVIEW_SUBSEQUENT_NOTICE';

CREATE TABLE "SubsequentNotice" (
  "id" TEXT NOT NULL,
  "pcnId" TEXT NOT NULL,
  "noticeType" "NoticeType" NOT NULL,
  "receivedDate" DATE NOT NULL,
  "hasNewInformation" BOOLEAN NOT NULL DEFAULT false,
  "evidenceDetails" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubsequentNotice_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SubsequentNotice_pcnId_receivedDate_idx" ON "SubsequentNotice"("pcnId", "receivedDate");
CREATE INDEX "SubsequentNotice_hasNewInformation_idx" ON "SubsequentNotice"("hasNewInformation");

ALTER TABLE "SubsequentNotice" ADD CONSTRAINT "SubsequentNotice_pcnId_fkey" FOREIGN KEY ("pcnId") REFERENCES "Pcn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
