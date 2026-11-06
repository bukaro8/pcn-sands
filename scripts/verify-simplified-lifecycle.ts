import "dotenv/config";

import { getDailyChecklist, completeChecklistTask } from "../src/lib/checklist";
import { appConfig } from "../src/lib/config";
import { processPersonalReminders } from "../src/lib/jobs";
import { prisma } from "../src/lib/prisma";
import { createOrGetReport } from "../src/lib/reporting";
import { getOrCreateVehicle } from "../src/lib/vehicles";

async function main() {
  const suffix = `lifecycle-${Date.now()}`;
  const now = new Date("2046-06-03T11:00:00.000Z");
  const paymentDeadline = new Date("2046-06-05T00:00:00.000Z");
  const jobKey = "personal-reminders:2046-06-03";
  const previous = { resend: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM, admin: process.env.ADMIN_EMAIL, fetch: globalThis.fetch };
  const sent: Array<Record<string, unknown>> = [];
  process.env.RESEND_API_KEY = "test_key";
  process.env.EMAIL_FROM = "Sands PCN Management <test@example.com>";
  process.env.ADMIN_EMAIL = "admin@example.test";
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(JSON.stringify({ id: `lifecycle-email-${sent.length}` }), { status: 200 });
  }) as typeof fetch;

  const issuer = await prisma.issuer.create({ data: { name: `Lifecycle Council ${suffix}`, normalizedName: `lifecycle council ${suffix}`, type: "COUNCIL" } });
  const vehicle = await getOrCreateVehicle(`LC${Date.now()}`);
  const reportIds: string[] = [];
  let pcnId: string | undefined;

  try {
    const pcn = await prisma.pcn.create({ data: {
      reference: `LIFECYCLE-${suffix}`,
      vehicleId: vehicle.id,
      issuerId: issuer.id,
      contraventionLocation: "Fictional Lifecycle Street",
      contraventionDate: new Date("2046-06-01T00:00:00.000Z"),
      issueDate: new Date("2046-06-01T00:00:00.000Z"),
      noticeType: "ORIGINAL_PCN",
    } });
    pcnId = pcn.id;

    const accepted = await prisma.challenge.create({ data: { pcnId, stage: "INITIAL", submissionDate: new Date("2046-06-01T00:00:00.000Z"), outcome: "ACCEPTED", decisionDate: new Date("2046-06-02T00:00:00.000Z") } });
    await prisma.pcn.update({ where: { id: pcnId }, data: { challengeStatus: "ACCEPTED" } });
    if ((await prisma.pcn.findUniqueOrThrow({ where: { id: pcnId } })).challengeStatus !== "ACCEPTED") throw new Error("Accepted initial challenge was not retained");

    await prisma.challenge.update({ where: { id: accepted.id }, data: { outcome: "REJECTED", decisionDate: new Date("2046-06-03T00:00:00.000Z") } });
    await prisma.pcn.update({ where: { id: pcnId }, data: { challengeStatus: "REJECTED", paymentStatus: "PAYMENT_REQUIRED", paymentDeadline, paymentAmountPence: 6500 } });
    const paymentReminder = await prisma.reminder.create({ data: { pcnId, type: "PAYMENT_DEADLINE", eventKey: `lifecycle-payment:${suffix}`, dueAt: new Date("2046-06-03T00:00:00.000Z") } });
    const rejected = await prisma.pcn.findUniqueOrThrow({ where: { id: pcnId } });
    if (rejected.challengeStatus !== "REJECTED" || rejected.paymentStatus !== "PAYMENT_REQUIRED" || rejected.paymentAmountPence !== 6500 || rejected.paymentDeadline?.getTime() !== paymentDeadline.getTime()) throw new Error("Rejected challenge payment details were not retained");

    const firstChecklist = await getDailyChecklist(now);
    const decisionTask = firstChecklist.find((task) => task.pcnId === pcnId && task.type === "REVIEW_DECISION");
    if (!decisionTask) throw new Error("Recorded rejection did not create a single decision review task");
    await completeChecklistTask(decisionTask.id);
    if ((await getDailyChecklist(now)).some((task) => task.pcnId === pcnId)) throw new Error("An unpaid case remained in the checklist after its decision review was completed");

    const reminderResult = await processPersonalReminders(new Date("2046-06-03T06:00:00.000Z"));
    const deliveredReminder = await prisma.reminder.findUniqueOrThrow({ where: { id: paymentReminder.id }, include: { delivery: true } });
    if (reminderResult.status !== "succeeded" || deliveredReminder.status !== "NOTIFIED" || deliveredReminder.delivery?.recipient !== appConfig.managerWeeklyReportRecipient || !String(sent[0]?.to).includes(appConfig.managerWeeklyReportRecipient)) throw new Error("Payment reminder was not sent once to the management recipient");
    const duplicateReminder = await processPersonalReminders(new Date("2046-06-03T07:00:00.000Z"));
    if (duplicateReminder.status !== "skipped" || sent.length !== 1) throw new Error("Duplicate payment reminder was sent");

    const report = await createOrGetReport("WEEKLY", new Date("2046-06-05T06:00:00.000Z"));
    reportIds.push(report.id);
    const paymentEntry = report.entries.find((entry) => entry.pcnId === pcnId);
    if (!paymentEntry || paymentEntry.paymentStatus !== "PAYMENT_REQUIRED" || paymentEntry.paymentAmountPence !== 6500) throw new Error("Rejected payment case was not preserved in the Friday report snapshot");

    await prisma.subsequentNotice.create({ data: { pcnId, noticeType: "NOTICE_TO_OWNER", receivedDate: new Date("2046-06-06T00:00:00.000Z"), hasNewInformation: false } });
    await prisma.subsequentNotice.create({ data: { pcnId, noticeType: "NOTICE_TO_OWNER", receivedDate: new Date("2046-06-07T00:00:00.000Z"), hasNewInformation: true, evidenceDetails: "Fictional new information for review." } });
    const noticeChecklist = await getDailyChecklist(new Date("2046-06-08T11:00:00.000Z"));
    const noticeTask = noticeChecklist.find((task) => task.pcnId === pcnId && task.type === "REVIEW_SUBSEQUENT_NOTICE");
    if (!noticeTask || noticeChecklist.filter((task) => task.pcnId === pcnId).length !== 1) throw new Error("Subsequent notice review task was missing or duplicated");
    await completeChecklistTask(noticeTask.id);
    if ((await prisma.pcn.findUniqueOrThrow({ where: { id: pcnId } })).challengeStatus !== "REJECTED") throw new Error("Subsequent notice review changed the rejected outcome");

    await prisma.pcn.update({ where: { id: pcnId }, data: { paymentStatus: "PAID", paymentReference: "Fictional confirmation" } });
    if ((await prisma.pcn.findUniqueOrThrow({ where: { id: pcnId } })).paymentStatus !== "PAID") throw new Error("Explicit payment confirmation was not retained");
    console.log("Simplified lifecycle, payment notification, checklist cleanup, reporting and subsequent notice verification passed");
  } finally {
    if (reportIds.length) await prisma.reportHistory.deleteMany({ where: { id: { in: reportIds } } });
    await prisma.jobExecution.deleteMany({ where: { jobKey } });
    if (pcnId) await prisma.pcn.delete({ where: { id: pcnId } });
    await prisma.vehicle.delete({ where: { id: vehicle.id } });
    await prisma.issuer.delete({ where: { id: issuer.id } });
    await prisma.$disconnect();
    process.env.RESEND_API_KEY = previous.resend; process.env.EMAIL_FROM = previous.from; process.env.ADMIN_EMAIL = previous.admin; globalThis.fetch = previous.fetch;
  }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
