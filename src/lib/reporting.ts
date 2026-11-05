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
        await tx.reportEntry.create({ data: { reportId: report.id, pcnId: pcn.id, challengeStatus: pcn.challengeStatus, paymentStatus: pcn.paymentStatus, paymentDeadline: pcn.paymentDeadline, paymentNoticeNumber: outstanding ? (previous?.paymentNoticeNumber ?? 0) + 1 : null } });
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
  const submitted = report.entries.flatMap((entry) => entry.pcn.challenges).filter((challenge) => challenge.submissionDate && challenge.submissionDate >= report.periodStart && challenge.submissionDate <= report.periodEnd).length;
  const accepted = report.entries.flatMap((entry) => entry.pcn.challenges).filter((challenge) => challenge.decisionDate && challenge.decisionDate >= report.periodStart && challenge.decisionDate <= report.periodEnd && challenge.outcome === "ACCEPTED").length;
  const rejected = report.entries.flatMap((entry) => entry.pcn.challenges).filter((challenge) => challenge.decisionDate && challenge.decisionDate >= report.periodStart && challenge.decisionDate <= report.periodEnd && challenge.outcome === "REJECTED").length;
  const pending = report.entries.flatMap((entry) => entry.pcn.challenges).filter((challenge) => challenge.outcome === "PENDING" && challenge.submissionDate && challenge.submissionDate <= report.periodEnd).length;
  return { report, submitted, accepted, rejected, pending };
}
