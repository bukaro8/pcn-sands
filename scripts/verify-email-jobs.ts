import "dotenv/config";

import { processPersonalReminders, processWeeklyReport, isWeeklyReportWindow, sendFreshReportEmail } from "../src/lib/jobs";
import { createReportSnapshot } from "../src/lib/reporting";
import { prisma } from "../src/lib/prisma";
import { getOrCreateVehicle } from "../src/lib/vehicles";

async function main() {
  await prisma.jobExecution.deleteMany({ where: { jobKey: { in: ["weekly-report:2039-05-30", "weekly-report:2039-06-06", "personal-reminders:2039-06-03", "personal-reminders:2039-06-04"] } } });
  if (!isWeeklyReportWindow(new Date("2039-06-03T06:00:00.000Z")) || !isWeeklyReportWindow(new Date("2039-11-04T07:00:00.000Z"))) throw new Error("GMT/BST weekly schedule calculation failed");
  const previous = { resend: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM, manager: process.env.MANAGER_EMAIL, admin: process.env.ADMIN_EMAIL, fetch: globalThis.fetch };
  process.env.RESEND_API_KEY = "test_key"; process.env.EMAIL_FROM = "Sands PCN Management <test@example.com>"; process.env.MANAGER_EMAIL = "manager@example.test"; process.env.ADMIN_EMAIL = "admin@example.com";
  const sent: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => { sent.push(JSON.parse(String(init?.body)) as Record<string, unknown>); return new Response(JSON.stringify({ id: `email_${sent.length}` }), { status: 200 }); }) as typeof fetch;
  const suffix = `email-job-${Date.now()}`;
  const issuer = await prisma.issuer.create({ data: { name: `Email Council ${suffix}`, normalizedName: `email council ${suffix}`, type: "COUNCIL" } });
  const vehicle = await getOrCreateVehicle(`E${Date.now()}`); let pcnId: string | undefined; const reportIds: string[] = [];
  try {
    const pcn = await prisma.pcn.create({ data: { reference: `EMAIL-${suffix}`, vehicleId: vehicle.id, issuerId: issuer.id, contraventionLocation: "Email Street", contraventionDate: new Date("2039-06-01T00:00:00.000Z"), issueDate: new Date("2039-06-01T00:00:00.000Z"), noticeType: "ORIGINAL_PCN", paymentStatus: "PAYMENT_REQUIRED", paymentDeadline: new Date("2039-06-05T00:00:00.000Z") } }); pcnId = pcn.id;
    const challenge = await prisma.challenge.create({ data: { pcnId, stage: "INITIAL", submissionDate: new Date("2039-06-01T00:00:00.000Z") } });
    const manualWeekly = await createReportSnapshot("WEEKLY", new Date("2039-06-03T05:30:00.000Z")); reportIds.push(manualWeekly.id);
    const weekly = await processWeeklyReport(new Date("2039-06-03T06:00:00.000Z"));
    if (weekly.status !== "succeeded" || sent.length !== 1 || !String(sent[0]?.to).includes("manager@example.test") || !JSON.stringify(sent[0]).includes("attachments")) throw new Error("Weekly report email verification failed");
    if ("reportId" in weekly) { reportIds.push(weekly.reportId); if (weekly.reportId === manualWeekly.id) throw new Error("Manual generation suppressed the scheduled report snapshot"); }
    const duplicate = await processWeeklyReport(new Date("2039-06-03T06:05:00.000Z")); if (duplicate.status !== "skipped" || sent.length !== 1) throw new Error("Duplicate weekly report was sent");
    const monthly = await createReportSnapshot("MONTHLY", new Date("2039-06-15T09:00:00.000Z")); reportIds.push(monthly.id);
    const monthlyResult = await sendFreshReportEmail(monthly.id); reportIds.push(monthlyResult.reportId);
    const monthlyPayload = sent.at(-1);
    if (!monthlyResult.sent || monthlyResult.reportId === monthly.id || !String(monthlyPayload?.subject).includes("Sands Monthly PCN Report") || !String(monthlyPayload?.html).includes("PCA · PCN Coordination")) throw new Error("Fresh monthly executive report email verification failed");
    globalThis.fetch = (async () => new Response(JSON.stringify({ message: "failure" }), { status: 500 })) as typeof fetch;
    const failed = await processWeeklyReport(new Date("2039-06-10T06:00:00.000Z")); if (failed.status !== "failed") throw new Error("Failed email handling was not recorded");
    const failedJob = await prisma.jobExecution.findUniqueOrThrow({ where: { jobKey: "weekly-report:2039-06-06" } });
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => { sent.push(JSON.parse(String(init?.body)) as Record<string, unknown>); return new Response(JSON.stringify({ id: `email_${sent.length}` }), { status: 200 }); }) as typeof fetch;
    const retried = await processWeeklyReport(new Date("2039-06-10T06:05:00.000Z")); if (retried.status !== "succeeded") throw new Error("Failed report email did not retry safely");
    if ("reportId" in retried) { reportIds.push(retried.reportId); if (retried.reportId !== failedJob.reportId) throw new Error("Scheduled retry created a second report or email run"); }
    const reminder = await prisma.reminder.create({ data: { pcnId, type: "PAYMENT_DEADLINE", eventKey: `email-test:${suffix}`, dueAt: new Date("2039-06-03T00:00:00.000Z") } });
    const statusCheckReminder = await prisma.reminder.create({ data: { pcnId, challengeId: challenge.id, type: "CHALLENGE_STATUS_CHECK", eventKey: `email-test-status-check:${suffix}`, dueAt: new Date("2039-06-03T00:00:00.000Z") } });
    const reminders = await processPersonalReminders(new Date("2039-06-03T06:00:00.000Z"));
    const [delivered, deliveredStatusCheck] = await Promise.all([
      prisma.reminder.findUniqueOrThrow({ where: { id: reminder.id }, include: { delivery: true } }),
      prisma.reminder.findUniqueOrThrow({ where: { id: statusCheckReminder.id }, include: { delivery: true } }),
    ]);
    if (reminders.status !== "succeeded" || reminders.count !== 2 || delivered.status !== "NOTIFIED" || delivered.delivery?.status !== "SENT" || deliveredStatusCheck.status !== "NOTIFIED" || deliveredStatusCheck.delivery?.status !== "SENT" || sent.length < 4) throw new Error("Personal reminder verification failed");
    await prisma.reminder.update({ where: { id: reminder.id }, data: { status: "COMPLETED", completedAt: new Date() } });
    if ((await prisma.reminder.findUniqueOrThrow({ where: { id: reminder.id } })).status !== "COMPLETED") throw new Error("Reminder completion verification failed");
    delete process.env.ADMIN_EMAIL;
    const missingAdmin = await processPersonalReminders(new Date("2039-06-04T06:00:00.000Z"));
    if (missingAdmin.status !== "skipped" || missingAdmin.reason !== "no-reminders-due") throw new Error("Missing ADMIN_EMAIL was not handled safely");
    process.env.ADMIN_EMAIL = "admin@example.com";
    console.log("Mocked fresh manual email, scheduled report independence, retry idempotency, reminders, DST scheduling and completion successful");
  } finally {
    if (reportIds.length) await prisma.reportHistory.deleteMany({ where: { id: { in: reportIds } } });
    if (pcnId) await prisma.pcn.delete({ where: { id: pcnId } });
    await prisma.vehicle.delete({ where: { id: vehicle.id } }); await prisma.issuer.delete({ where: { id: issuer.id } }); await prisma.$disconnect();
    await prisma.jobExecution.deleteMany({ where: { jobKey: { in: ["weekly-report:2039-05-30", "weekly-report:2039-06-06", "personal-reminders:2039-06-03", "personal-reminders:2039-06-04"] } } });
    process.env.RESEND_API_KEY = previous.resend; process.env.EMAIL_FROM = previous.from; process.env.MANAGER_EMAIL = previous.manager; process.env.ADMIN_EMAIL = previous.admin; globalThis.fetch = previous.fetch;
  }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
