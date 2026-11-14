import { prisma } from "@/lib/prisma";

export type ReportType = "WEEKLY" | "MONTHLY";

function londonDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return { year: Number(part("year")), month: Number(part("month")), day: Number(part("day")) };
}

function utcDate(year: number, month: number, day: number) { return new Date(Date.UTC(year, month - 1, day)); }

export function reportingPeriod(type: ReportType, now = new Date()) {
  const { year, month, day } = londonDateParts(now);
  if (type === "MONTHLY") {
    return { start: utcDate(year, month, 1), end: new Date(Date.UTC(year, month, 0)), label: new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "Europe/London" }).format(now) };
  }
  const current = utcDate(year, month, day);
  const weekday = current.getUTCDay() || 7;
  const start = new Date(current); start.setUTCDate(current.getUTCDate() - weekday + 1);
  const end = new Date(start); end.setUTCDate(start.getUTCDate() + 3);
  return { start, end, label: `${formatDate(start)} - ${formatDate(end)}` };
}

export function formatDate(date: Date) { return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(date); }

export function noticeLabel(number: number | null) {
  if (!number || number === 1) return "First notice";
  if (number === 2) return "Second notice";
  return "Subsequent notice";
}

export async function createReportSnapshot(type: ReportType, now = new Date()) {
  const period = reportingPeriod(type, now);
  return createReportSnapshotForPeriod(type, period.start, period.end);
}

export async function createReportSnapshotForPeriod(type: ReportType, periodStart: Date, periodEnd: Date) {
  const pcns = await prisma.pcn.findMany({
    where: {
      OR: [
        { challenges: { some: { submissionDate: { gte: periodStart, lte: periodEnd } } } },
        { challenges: { some: { decisionDate: { gte: periodStart, lte: periodEnd } } } },
        { challenges: { some: { outcome: "PENDING", submissionDate: { lte: periodEnd } } } },
        { paymentStatus: { in: ["PAYMENT_REQUIRED", "PAYMENT_UNCONFIRMED"] } },
      ],
    },
    include: { challenges: true },
  });

  return prisma.$transaction(async (tx) => {
    const report = await tx.reportHistory.create({ data: { type, periodStart, periodEnd } });
    for (const pcn of pcns) {
      const outstanding = pcn.paymentStatus === "PAYMENT_REQUIRED" || pcn.paymentStatus === "PAYMENT_UNCONFIRMED";
      const nextStatusCheckDate = pcn.challenges
        .filter((challenge) => challenge.outcome === "PENDING" && challenge.submissionDate && challenge.nextStatusCheckDate)
        .sort((left, right) => (right.submissionDate?.getTime() ?? 0) - (left.submissionDate?.getTime() ?? 0))[0]?.nextStatusCheckDate ?? null;
      const submittedInPeriod = pcn.challenges.some((challenge) => Boolean(challenge.submissionDate && challenge.submissionDate >= periodStart && challenge.submissionDate <= periodEnd));
      const acceptedInPeriod = pcn.challenges.some((challenge) => Boolean(challenge.outcome === "ACCEPTED" && challenge.decisionDate && challenge.decisionDate >= periodStart && challenge.decisionDate <= periodEnd));
      const rejectedInPeriod = pcn.challenges.some((challenge) => Boolean(challenge.outcome === "REJECTED" && challenge.decisionDate && challenge.decisionDate >= periodStart && challenge.decisionDate <= periodEnd));
      let paymentNoticeNumber: number | null = null;
      if (outstanding) {
        const samePeriod = await tx.reportEntry.findFirst({
          where: { pcnId: pcn.id, paymentNoticeNumber: { not: null }, report: { type, periodStart, periodEnd } },
          orderBy: { report: { generatedAt: "desc" } },
          select: { paymentNoticeNumber: true },
        });
        const previous = samePeriod ?? await tx.reportEntry.findFirst({
          where: { pcnId: pcn.id, paymentNoticeNumber: { not: null }, report: { type } },
          orderBy: { paymentNoticeNumber: "desc" },
          select: { paymentNoticeNumber: true },
        });
        paymentNoticeNumber = samePeriod ? samePeriod.paymentNoticeNumber : (previous?.paymentNoticeNumber ?? 0) + 1;
      }
      await tx.reportEntry.create({ data: { reportId: report.id, pcnId: pcn.id, challengeStatus: pcn.challengeStatus, paymentStatus: pcn.paymentStatus, paymentDeadline: pcn.paymentDeadline, nextStatusCheckDate, paymentAmountPence: pcn.paymentAmountPence, paymentNoticeNumber, submittedInPeriod, acceptedInPeriod, rejectedInPeriod } });
    }
    return tx.reportHistory.findUniqueOrThrow({ where: { id: report.id }, include: { entries: true } });
  });
}

export async function reportForPdf(reportId: string) {
  const report = await prisma.reportHistory.findUnique({ where: { id: reportId }, include: { entries: { include: { pcn: { include: { vehicle: true } } }, orderBy: { pcn: { reference: "asc" } } } } });
  if (!report) return null;
  const submitted = report.entries.filter((entry) => entry.submittedInPeriod).length;
  const accepted = report.entries.filter((entry) => entry.acceptedInPeriod).length;
  const rejected = report.entries.filter((entry) => entry.rejectedInPeriod).length;
  const outcomeCounts = report.entries.reduce((counts, entry) => {
    if (entry.challengeStatus === "AWAITING_DECISION") counts.awaiting += 1;
    if (entry.challengeStatus === "ACCEPTED") counts.accepted += 1;
    if (entry.challengeStatus === "REJECTED") counts.rejected += 1;
    return counts;
  }, { awaiting: 0, accepted: 0, rejected: 0 });
  const decided = accepted + rejected;
  return {
    report,
    submitted,
    accepted,
    rejected,
    pending: outcomeCounts.awaiting,
    outcomeCounts,
    outcomeTotal: outcomeCounts.awaiting + outcomeCounts.accepted + outcomeCounts.rejected,
    successRate: decided ? Math.round((accepted / decided) * 100) : null,
  };
}
