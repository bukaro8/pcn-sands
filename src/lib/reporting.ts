import { prisma } from "@/lib/prisma";

type ReportType = "WEEKLY" | "MONTHLY";

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

export async function createOrGetReport(type: ReportType, now = new Date()) {
  const period = reportingPeriod(type, now);
  const existing = await prisma.reportHistory.findUnique({ where: { type_periodStart_periodEnd: { type, periodStart: period.start, periodEnd: period.end } }, include: { entries: true } });
  if (existing) return existing;

  const pcns = await prisma.pcn.findMany({
    where: {
      OR: [
        { challenges: { some: { submissionDate: { gte: period.start, lte: period.end } } } },
        { challenges: { some: { decisionDate: { gte: period.start, lte: period.end } } } },
        { challenges: { some: { outcome: "PENDING", submissionDate: { lte: period.end } } } },
        { paymentStatus: { in: ["PAYMENT_REQUIRED", "PAYMENT_UNCONFIRMED"] } },
      ],
    },
    include: { challenges: true },
  });

  try {
    return await prisma.$transaction(async (tx) => {
      const report = await tx.reportHistory.create({ data: { type, periodStart: period.start, periodEnd: period.end } });
      for (const pcn of pcns) {
        const outstanding = pcn.paymentStatus === "PAYMENT_REQUIRED" || pcn.paymentStatus === "PAYMENT_UNCONFIRMED";
        const previous = outstanding ? await tx.reportEntry.findFirst({ where: { pcnId: pcn.id, paymentNoticeNumber: { not: null } }, orderBy: { paymentNoticeNumber: "desc" }, select: { paymentNoticeNumber: true } }) : null;
        await tx.reportEntry.create({ data: { reportId: report.id, pcnId: pcn.id, challengeStatus: pcn.challengeStatus, paymentStatus: pcn.paymentStatus, paymentDeadline: pcn.paymentDeadline, paymentAmountPence: pcn.paymentAmountPence, paymentNoticeNumber: outstanding ? (previous?.paymentNoticeNumber ?? 0) + 1 : null } });
      }
      return tx.reportHistory.findUniqueOrThrow({ where: { id: report.id }, include: { entries: true } });
    });
  } catch (error) {
    const raced = await prisma.reportHistory.findUnique({ where: { type_periodStart_periodEnd: { type, periodStart: period.start, periodEnd: period.end } }, include: { entries: true } });
    if (raced) return raced;
    throw error;
  }
}

export async function reportForPdf(reportId: string) {
  const report = await prisma.reportHistory.findUnique({ where: { id: reportId }, include: { entries: { include: { pcn: { include: { vehicle: true, challenges: true } } }, orderBy: { pcn: { reference: "asc" } } } } });
  if (!report) return null;
  const inPeriod = (date: Date | null) => Boolean(date && date >= report.periodStart && date <= report.periodEnd);
  const submittedCases = new Set<string>();
  const acceptedCases = new Set<string>();
  const rejectedCases = new Set<string>();
  for (const entry of report.entries) {
    for (const challenge of entry.pcn.challenges) {
      if (inPeriod(challenge.submissionDate)) submittedCases.add(entry.pcnId);
      if (inPeriod(challenge.decisionDate) && challenge.outcome === "ACCEPTED") acceptedCases.add(entry.pcnId);
      if (inPeriod(challenge.decisionDate) && challenge.outcome === "REJECTED") rejectedCases.add(entry.pcnId);
    }
  }
  const outcomeCounts = report.entries.reduce((counts, entry) => {
    if (entry.challengeStatus === "AWAITING_DECISION") counts.awaiting += 1;
    if (entry.challengeStatus === "ACCEPTED") counts.accepted += 1;
    if (entry.challengeStatus === "REJECTED") counts.rejected += 1;
    return counts;
  }, { awaiting: 0, accepted: 0, rejected: 0 });
  const decided = acceptedCases.size + rejectedCases.size;
  return {
    report,
    submitted: submittedCases.size,
    accepted: acceptedCases.size,
    rejected: rejectedCases.size,
    pending: outcomeCounts.awaiting,
    outcomeCounts,
    outcomeTotal: outcomeCounts.awaiting + outcomeCounts.accepted + outcomeCounts.rejected,
    successRate: decided ? Math.round((acceptedCases.size / decided) * 100) : null,
  };
}
