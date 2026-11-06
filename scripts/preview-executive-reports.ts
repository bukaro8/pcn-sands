import "dotenv/config";

import { mkdir, writeFile } from "node:fs/promises";

import { buildReportEmailHtml } from "../src/lib/report-email";
import { buildReportPdf } from "../src/lib/report-pdf";
import { reportForPdf } from "../src/lib/reporting";
import { prisma } from "../src/lib/prisma";

type CaseStatus = "AWAITING_DECISION" | "ACCEPTED" | "REJECTED";

async function unusedYear() {
  for (let year = 2092; year < 2200; year += 1) {
    const occupied = await prisma.reportHistory.findFirst({ where: { periodStart: { gte: new Date(`${year}-01-01T00:00:00.000Z`), lt: new Date(`${year + 1}-01-01T00:00:00.000Z`) } } });
    if (!occupied) return year;
  }
  throw new Error("Could not find an unused fictional reporting year");
}

async function main() {
  const suffix = `prompt15-${Date.now()}`;
  const year = await unusedYear();
  const weekStart = new Date(Date.UTC(year, 0, 1));
  while (weekStart.getUTCDay() !== 1) weekStart.setUTCDate(weekStart.getUTCDate() + 1);
  const weekEnd = new Date(weekStart); weekEnd.setUTCDate(weekStart.getUTCDate() + 3);
  const issuer = await prisma.issuer.create({ data: { name: `Fictional Borough Council ${suffix}`, normalizedName: `fictional borough council ${suffix}`, type: "COUNCIL" } });
  const reportIds: string[] = []; const pcnIds: string[] = []; const vehicleIds: string[] = [];

  async function createCase(index: number, status: CaseStatus, period: "weekly" | "monthly", payment = false) {
    const registration = `PX${String(index).padStart(2, "0")} WWS`;
    const vehicle = await prisma.vehicle.create({ data: { registrationNormalized: registration.replace(/\s/g, ""), registrationDisplay: registration } });
    vehicleIds.push(vehicle.id);
    const submissionDate = period === "weekly" ? new Date(weekStart) : new Date(`${year}-02-04T00:00:00.000Z`);
    const decisionDate = new Date(submissionDate); decisionDate.setUTCDate(submissionDate.getUTCDate() + 1);
    const issueDate = new Date(submissionDate); issueDate.setUTCDate(submissionDate.getUTCDate() - 2);
    const paymentDeadline = new Date(submissionDate); paymentDeadline.setUTCDate(submissionDate.getUTCDate() + 10 + (index % 6));
    const pcn = await prisma.pcn.create({ data: {
      reference: `P15-${period === "weekly" ? "W" : "M"}-${String(index).padStart(3, "0")}-${suffix}`,
      vehicleId: vehicle.id,
      issuerId: issuer.id,
      contraventionLocation: "Fictional Distribution Street",
      contraventionDate: issueDate,
      issueDate,
      noticeType: "ORIGINAL_PCN",
      challengeStatus: status,
      paymentStatus: payment ? (index % 2 ? "PAYMENT_REQUIRED" : "PAYMENT_UNCONFIRMED") : "NOT_REQUIRED",
      paymentDeadline: payment ? paymentDeadline : null,
      paymentAmountPence: payment ? 6500 + index * 500 : null,
      notes: "Fictional executive report preview record",
    } });
    pcnIds.push(pcn.id);
    const outcome = status === "ACCEPTED" ? "ACCEPTED" : status === "REJECTED" ? "REJECTED" : "PENDING";
    await prisma.challenge.create({ data: {
      pcnId: pcn.id,
      stage: "INITIAL",
      submissionDate,
      outcome,
      decisionDate: outcome === "PENDING" ? null : decisionDate,
    } });
    return pcn;
  }

  try {
    const weeklyCases = [
      await createCase(1, "AWAITING_DECISION", "weekly"),
      await createCase(2, "ACCEPTED", "weekly"),
      await createCase(3, "ACCEPTED", "weekly"),
      await createCase(4, "REJECTED", "weekly", true),
      await createCase(5, "REJECTED", "weekly", true),
    ];
    const generatedAt = new Date(weekEnd); generatedAt.setUTCDate(weekEnd.getUTCDate() + 1); generatedAt.setUTCHours(7);
    const weekly = await prisma.reportHistory.create({ data: { type: "WEEKLY", periodStart: weekStart, periodEnd: weekEnd, generatedAt } });
    reportIds.push(weekly.id);
    await prisma.reportEntry.createMany({ data: weeklyCases.map((pcn, index) => ({ reportId: weekly.id, pcnId: pcn.id, challengeStatus: pcn.challengeStatus, paymentStatus: pcn.paymentStatus, paymentDeadline: pcn.paymentDeadline, paymentAmountPence: pcn.paymentAmountPence, paymentNoticeNumber: pcn.paymentStatus === "NOT_REQUIRED" ? null : index + 1 })) });

    const monthlyCases = [];
    for (let index = 10; index < 24; index += 1) {
      const status: CaseStatus = index < 12 ? "AWAITING_DECISION" : index < 14 ? "ACCEPTED" : "REJECTED";
      monthlyCases.push(await createCase(index, status, "monthly", status === "REJECTED"));
    }
    const monthly = await prisma.reportHistory.create({ data: { type: "MONTHLY", periodStart: new Date(`${year}-02-01T00:00:00.000Z`), periodEnd: new Date(`${year}-02-28T00:00:00.000Z`), generatedAt: new Date(`${year}-03-01T09:00:00.000Z`) } });
    reportIds.push(monthly.id);
    await prisma.reportEntry.createMany({ data: monthlyCases.map((pcn, index) => ({ reportId: monthly.id, pcnId: pcn.id, challengeStatus: pcn.challengeStatus, paymentStatus: pcn.paymentStatus, paymentDeadline: pcn.paymentDeadline, paymentAmountPence: pcn.paymentAmountPence, paymentNoticeNumber: pcn.paymentStatus === "NOT_REQUIRED" ? null : (index % 3) + 1 })) });

    const empty = await prisma.reportHistory.create({ data: { type: "WEEKLY", periodStart: new Date(`${year}-03-03T00:00:00.000Z`), periodEnd: new Date(`${year}-03-06T00:00:00.000Z`), generatedAt: new Date(`${year}-03-07T07:00:00.000Z`) } });
    reportIds.push(empty.id);

    const [weeklyPdf, monthlyPdf, emptyPdf, weeklyData, monthlyData] = await Promise.all([buildReportPdf(weekly.id), buildReportPdf(monthly.id), buildReportPdf(empty.id), reportForPdf(weekly.id), reportForPdf(monthly.id)]);
    if (!weeklyPdf || !monthlyPdf || !emptyPdf || !weeklyData || !monthlyData) throw new Error("Preview report generation failed");
    await mkdir("output/pdf", { recursive: true }); await mkdir("output/email", { recursive: true });
    await Promise.all([
      writeFile("output/pdf/sands-weekly-pcn-report-preview.pdf", weeklyPdf),
      writeFile("output/pdf/sands-monthly-pcn-report-preview.pdf", monthlyPdf),
      writeFile("/private/tmp/sands-zero-data-report-preview.pdf", emptyPdf),
      writeFile("output/email/sands-weekly-pcn-report-preview.html", buildReportEmailHtml({ type: "WEEKLY", periodStart: weekly.periodStart, periodEnd: weekly.periodEnd, submitted: weeklyData.submitted, accepted: weeklyData.accepted, rejected: weeklyData.rejected, pending: weeklyData.pending, payments: weeklyData.report.entries.filter((entry) => entry.paymentNoticeNumber && entry.paymentStatus !== "PAID") })),
      writeFile("output/email/sands-monthly-pcn-report-preview.html", buildReportEmailHtml({ type: "MONTHLY", periodStart: monthly.periodStart, periodEnd: monthly.periodEnd, submitted: monthlyData.submitted, accepted: monthlyData.accepted, rejected: monthlyData.rejected, pending: monthlyData.pending, payments: monthlyData.report.entries.filter((entry) => entry.paymentNoticeNumber && entry.paymentStatus !== "PAID") })),
    ]);
    console.log("Executive weekly, monthly, zero-data and email previews generated");
  } finally {
    if (reportIds.length) await prisma.reportHistory.deleteMany({ where: { id: { in: reportIds } } });
    if (pcnIds.length) await prisma.pcn.deleteMany({ where: { id: { in: pcnIds } } });
    if (vehicleIds.length) await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
    await prisma.issuer.delete({ where: { id: issuer.id } });
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
