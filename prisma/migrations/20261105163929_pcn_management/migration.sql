-- CreateEnum
CREATE TYPE "IssuerType" AS ENUM ('COUNCIL', 'PRIVATE');

-- CreateEnum
CREATE TYPE "NoticeType" AS ENUM ('ORIGINAL_PCN', 'NOTICE_TO_OWNER', 'PRIVATE_PARKING_NOTICE', 'OTHER');

-- CreateEnum
CREATE TYPE "ChallengeStatus" AS ENUM ('AWAITING_CHALLENGE', 'AWAITING_DECISION', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('NOT_REQUIRED', 'PAYMENT_REQUIRED', 'PAYMENT_UNCONFIRMED', 'PAID');

-- CreateEnum
CREATE TYPE "ChallengeStage" AS ENUM ('INITIAL', 'FORMAL', 'INDEPENDENT');

-- CreateEnum
CREATE TYPE "ChallengeOutcome" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "EmailDeliveryStatus" AS ENUM ('NOT_SENT', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "ReminderType" AS ENUM ('CHALLENGE_STATUS_CHECK', 'PAYMENT_DEADLINE');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'NOTIFIED', 'COMPLETED');

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "registrationNormalized" TEXT NOT NULL,
    "registrationDisplay" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Issuer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "type" "IssuerType" NOT NULL,
    "challengeUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Issuer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pcn" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "issuerId" TEXT NOT NULL,
    "contraventionCode" TEXT,
    "contraventionLocation" TEXT NOT NULL,
    "contraventionDate" DATE NOT NULL,
    "issueDate" DATE NOT NULL,
    "noticeType" "NoticeType" NOT NULL,
    "challengeStatus" "ChallengeStatus" NOT NULL DEFAULT 'AWAITING_CHALLENGE',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "paymentDeadline" DATE,
    "paymentReference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pcn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Challenge" (
    "id" TEXT NOT NULL,
    "pcnId" TEXT NOT NULL,
    "stage" "ChallengeStage" NOT NULL,
    "submissionDate" DATE NOT NULL,
    "outcome" "ChallengeOutcome" NOT NULL DEFAULT 'PENDING',
    "decisionDate" DATE,
    "expectedResponseDate" DATE,
    "nextStatusCheckDate" DATE,
    "challengeText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportHistory" (
    "id" TEXT NOT NULL,
    "type" "ReportType" NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailDeliveryStatus" "EmailDeliveryStatus" NOT NULL DEFAULT 'NOT_SENT',
    "emailSentAt" TIMESTAMP(3),

    CONSTRAINT "ReportHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportEntry" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "pcnId" TEXT NOT NULL,
    "challengeStatus" "ChallengeStatus" NOT NULL,
    "paymentStatus" "PaymentStatus" NOT NULL,
    "paymentDeadline" DATE,
    "paymentNoticeNumber" INTEGER,

    CONSTRAINT "ReportEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "pcnId" TEXT NOT NULL,
    "challengeId" TEXT,
    "type" "ReminderType" NOT NULL,
    "eventKey" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "notifiedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_registrationNormalized_key" ON "Vehicle"("registrationNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "Issuer_normalizedName_key" ON "Issuer"("normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "Pcn_reference_key" ON "Pcn"("reference");

-- CreateIndex
CREATE INDEX "Pcn_vehicleId_idx" ON "Pcn"("vehicleId");

-- CreateIndex
CREATE INDEX "Pcn_issuerId_idx" ON "Pcn"("issuerId");

-- CreateIndex
CREATE INDEX "Pcn_challengeStatus_idx" ON "Pcn"("challengeStatus");

-- CreateIndex
CREATE INDEX "Pcn_paymentStatus_paymentDeadline_idx" ON "Pcn"("paymentStatus", "paymentDeadline");

-- CreateIndex
CREATE INDEX "Challenge_pcnId_stage_idx" ON "Challenge"("pcnId", "stage");

-- CreateIndex
CREATE INDEX "Challenge_outcome_nextStatusCheckDate_idx" ON "Challenge"("outcome", "nextStatusCheckDate");

-- CreateIndex
CREATE INDEX "ReportHistory_type_periodStart_periodEnd_idx" ON "ReportHistory"("type", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "ReportEntry_pcnId_paymentNoticeNumber_idx" ON "ReportEntry"("pcnId", "paymentNoticeNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ReportEntry_reportId_pcnId_key" ON "ReportEntry"("reportId", "pcnId");

-- CreateIndex
CREATE UNIQUE INDEX "Reminder_eventKey_key" ON "Reminder"("eventKey");

-- CreateIndex
CREATE INDEX "Reminder_status_dueAt_idx" ON "Reminder"("status", "dueAt");

-- CreateIndex
CREATE INDEX "Reminder_pcnId_type_idx" ON "Reminder"("pcnId", "type");

-- CreateIndex
CREATE INDEX "Reminder_challengeId_idx" ON "Reminder"("challengeId");

-- AddForeignKey
ALTER TABLE "Pcn" ADD CONSTRAINT "Pcn_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pcn" ADD CONSTRAINT "Pcn_issuerId_fkey" FOREIGN KEY ("issuerId") REFERENCES "Issuer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_pcnId_fkey" FOREIGN KEY ("pcnId") REFERENCES "Pcn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportEntry" ADD CONSTRAINT "ReportEntry_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ReportHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportEntry" ADD CONSTRAINT "ReportEntry_pcnId_fkey" FOREIGN KEY ("pcnId") REFERENCES "Pcn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_pcnId_fkey" FOREIGN KEY ("pcnId") REFERENCES "Pcn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
