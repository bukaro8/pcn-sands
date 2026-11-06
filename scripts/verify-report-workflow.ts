import "dotenv/config";
import { writeFile } from "node:fs/promises";

import { buildReportPdf } from "../src/lib/report-pdf";
import { createOrGetReport, reportForPdf } from "../src/lib/reporting";
import { prisma } from "../src/lib/prisma";
import { getOrCreateVehicle } from "../src/lib/vehicles";

async function main() {
  const suffix = `report-${Date.now()}`;
  const issuer = await prisma.issuer.create({ data: { name: `Report Council ${suffix}`, normalizedName: `report council ${suffix}`, type: "COUNCIL" } });
  const vehicle = await getOrCreateVehicle(`R${Date.now()}`);
  const reportIds: string[] = [];
  let pcnId: string | undefined;
  try {
    const pcn = await prisma.pcn.create({ data: { reference: `REPORT-${suffix}`, vehicleId: vehicle.id, issuerId: issuer.id, contraventionLocation: "Report Street", contraventionDate: new Date("2040-01-02T00:00:00.000Z"), issueDate: new Date("2040-01-03T00:00:00.000Z"), noticeType: "ORIGINAL_PCN", challengeStatus: "AWAITING_DECISION", paymentStatus: "PAYMENT_REQUIRED", paymentDeadline: new Date("2040-01-20T00:00:00.000Z"), paymentAmountPence: 6500 } });
    pcnId = pcn.id;
    await prisma.challenge.create({ data: { pcnId, stage: "INITIAL", submissionDate: new Date("2040-01-04T00:00:00.000Z"), outcome: "PENDING" } });
    await prisma.challenge.create({ data: { pcnId, stage: "FORMAL", submissionDate: new Date("2040-01-05T00:00:00.000Z"), outcome: "ACCEPTED", decisionDate: new Date("2040-01-05T00:00:00.000Z") } });
    const weekOne = await createOrGetReport("WEEKLY", new Date("2040-01-06T09:00:00.000Z")); reportIds.push(weekOne.id);
    const weekOneAgain = await createOrGetReport("WEEKLY", new Date("2040-01-06T12:00:00.000Z"));
    if (weekOne.id !== weekOneAgain.id) throw new Error("Repeated weekly generation created a second report");
    const entryOne = weekOne.entries.find((entry) => entry.pcnId === pcnId);
    if (entryOne?.paymentNoticeNumber !== 1) throw new Error("First payment notice was not recorded");
    const summary = await reportForPdf(weekOne.id);
    if (!summary || summary.submitted !== 1 || summary.accepted !== 1 || summary.outcomeCounts.awaiting !== 1 || summary.report.entries[0]?.paymentAmountPence !== 6500) throw new Error("Executive report counts or payment amount were incorrect");
    const weekTwo = await createOrGetReport("WEEKLY", new Date("2040-01-13T09:00:00.000Z")); reportIds.push(weekTwo.id);
    const entryTwo = weekTwo.entries.find((entry) => entry.pcnId === pcnId);
    if (entryTwo?.paymentNoticeNumber !== 2) throw new Error("Outstanding payment did not carry over as a second notice");
    const monthly = await createOrGetReport("MONTHLY", new Date("2040-02-05T09:00:00.000Z")); reportIds.push(monthly.id);
    const pdf = await buildReportPdf(weekTwo.id);
    if (!pdf || !new TextDecoder().decode(pdf.slice(0, 8)).startsWith("%PDF-1.")) throw new Error("PDF generation failed");
    await writeFile("/private/tmp/pcn-report-verification.pdf", pdf);
    console.log(`Report workflow verification successful; monthly report ${monthly.id} created and PDF written for visual inspection`);
  } finally {
    if (reportIds.length) await prisma.reportHistory.deleteMany({ where: { id: { in: reportIds } } });
    if (pcnId) await prisma.pcn.delete({ where: { id: pcnId } });
    await prisma.vehicle.delete({ where: { id: vehicle.id } });
    await prisma.issuer.delete({ where: { id: issuer.id } });
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
