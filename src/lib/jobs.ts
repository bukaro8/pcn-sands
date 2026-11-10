import { appConfig } from "@/lib/config";
import { getDailyChecklist, isWeekdayMidday, londonDateKey } from "@/lib/checklist";
import { buildChecklistEmailHtml } from "@/lib/checklist-email";
import { sendEmail } from "@/lib/email";
import { buildReportEmailHtml } from "@/lib/report-email";
import { buildReportPdf } from "@/lib/report-pdf";
import { createOrGetReport, formatDate, reportForPdf, reportingPeriod } from "@/lib/reporting";
import { prisma } from "@/lib/prisma";

function londonParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { weekday: value("weekday"), hour: Number(value("hour")), key: `${value("year")}-${value("month")}-${value("day")}` };
}

export function isWeeklyReportWindow(now = new Date()) { const parts = londonParts(now); return parts.weekday === "Fri" && parts.hour === 7; }

async function claimJob(jobKey: string, type: "WEEKLY_REPORT" | "REMINDER_DELIVERY" | "DAILY_CHECKLIST") {
  try { return await prisma.jobExecution.create({ data: { jobKey, type, status: "RUNNING" } }); }
  catch {
    const stale = new Date(Date.now() - 30 * 60 * 1000);
    const claimed = await prisma.jobExecution.updateMany({ where: { jobKey, OR: [{ status: "FAILED" }, { status: "RUNNING", startedAt: { lt: stale } }] }, data: { status: "RUNNING", startedAt: new Date(), finishedAt: null, error: null, attempts: { increment: 1 } } });
    return claimed.count ? prisma.jobExecution.findUniqueOrThrow({ where: { jobKey } }) : null;
  }
}

async function finishJob(jobKey: string, status: "SUCCEEDED" | "FAILED" | "SKIPPED", error?: string) {
  await prisma.jobExecution.update({ where: { jobKey }, data: { status, finishedAt: new Date(), error: error ?? null } });
}

export async function sendReportEmail(reportId: string) {
  const report = await prisma.reportHistory.findUnique({ where: { id: reportId } });
  if (!report) throw new Error("Report not found");
  if (report.emailDeliveryStatus === "SENT") return { sent: false, reason: "already-sent" as const };
  const pdf = await buildReportPdf(reportId);
  if (!pdf) throw new Error("Report PDF could not be generated");
  const reportData = await reportForPdf(reportId);
  if (!reportData) throw new Error("Report data could not be loaded");
  const managerEmail = appConfig.managerWeeklyReportRecipient;
  if (!managerEmail) throw new Error("MANAGER_EMAIL is missing or invalid");
  const period = `${formatDate(report.periodStart)} - ${formatDate(report.periodEnd)}`;
  const reportLabel = report.type === "WEEKLY" ? "Sands Weekly PCN Report" : "Sands Monthly PCN Report";
  const payments = reportData.report.entries.filter((entry) => entry.paymentNoticeNumber && entry.paymentStatus !== "PAID");
  try {
    const result = await sendEmail({
      to: managerEmail,
      subject: `${reportLabel} - ${period}`,
      html: buildReportEmailHtml({ type: report.type, periodStart: report.periodStart, periodEnd: report.periodEnd, submitted: reportData.submitted, accepted: reportData.accepted, rejected: reportData.rejected, pending: reportData.pending, payments }),
      attachment: { filename: `${report.type === "WEEKLY" ? "sands-weekly-pcn-report" : "sands-monthly-pcn-report"}-${report.periodStart.toISOString().slice(0, 10)}.pdf`, content: Buffer.from(pdf).toString("base64") },
    });
    await prisma.reportHistory.update({ where: { id: report.id }, data: { emailDeliveryStatus: "SENT", emailSentAt: new Date(), emailAttemptedAt: new Date(), emailProviderId: result.id, emailError: null } });
    return { sent: true, reason: "accepted" as const };
  } catch (error) {
    await prisma.reportHistory.updateMany({ where: { id: report.id, emailDeliveryStatus: { not: "SENT" } }, data: { emailDeliveryStatus: "FAILED", emailAttemptedAt: new Date(), emailError: "Email provider request failed" } });
    throw error;
  }
}

export async function processWeeklyReport(now = new Date(), enforceWindow = true) {
  if (enforceWindow && !isWeeklyReportWindow(now)) return { status: "skipped" as const, reason: "outside-window" };
  if (!appConfig.managerWeeklyReportRecipient) return { status: "skipped" as const, reason: "missing-manager-email" };
  const period = reportingPeriod("WEEKLY", now);
  const jobKey = `weekly-report:${period.start.toISOString().slice(0, 10)}`;
  const job = await claimJob(jobKey, "WEEKLY_REPORT");
  if (!job) return { status: "skipped" as const, reason: "already-processed" };
  try {
    const report = await createOrGetReport("WEEKLY", now);
    const result = await sendReportEmail(report.id);
    await finishJob(jobKey, "SUCCEEDED");
    return { status: "succeeded" as const, reportId: report.id, result };
  } catch {
    await finishJob(jobKey, "FAILED", "Weekly report email submission failed");
    return { status: "failed" as const };
  }
}

export async function processDailyChecklistEmail(now = new Date(), enforceWindow = true) {
  if (enforceWindow && !isWeekdayMidday(now)) return { status: "skipped" as const, reason: "outside-window" };
  const jobKey = `daily-checklist:${londonDateKey(now)}`;
  const job = await claimJob(jobKey, "DAILY_CHECKLIST");
  if (!job) return { status: "skipped" as const, reason: "already-processed" };
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) { await finishJob(jobKey, "SKIPPED", "ADMIN_EMAIL is not configured"); return { status: "skipped" as const, reason: "missing-admin-email" }; }
  const baseUrl = process.env.AUTH_URL?.trim();
  if (!baseUrl || !/^https:\/\//i.test(baseUrl)) { await finishJob(jobKey, "SKIPPED", "AUTH_URL must be configured as an HTTPS URL"); return { status: "skipped" as const, reason: "missing-public-url" }; }
  try {
    const tasks = await getDailyChecklist(now);
    if (!tasks.length) { await finishJob(jobKey, "SKIPPED", "No actionable checklist tasks"); return { status: "skipped" as const, reason: "no-actionable-tasks" }; }
    const result = await sendEmail({ to: adminEmail, subject: `Today's PCN checklist - ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Europe/London" }).format(now)}`, html: buildChecklistEmailHtml(tasks, baseUrl, now) });
    await finishJob(jobKey, "SUCCEEDED");
    return { status: "succeeded" as const, count: tasks.length, providerId: result.id };
  } catch {
    await finishJob(jobKey, "FAILED", "Daily checklist email submission failed");
    return { status: "failed" as const };
  }
}

export async function processPersonalReminders(now = new Date()) {
  const parts = londonParts(now); const jobKey = `personal-reminders:${parts.key}`;
  const job = await claimJob(jobKey, "REMINDER_DELIVERY");
  if (!job) return { status: "skipped" as const, reason: "already-processed" };
  const adminEmail = process.env.ADMIN_EMAIL;
  const start = new Date(`${parts.key}T00:00:00.000Z`);
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 1);
  // A failed job can be claimed again later that day; accepted reminders become
  // NOTIFIED and cannot be sent twice.
  const reminders = await prisma.reminder.findMany({ where: { status: "PENDING", dueAt: { gte: start, lt: end } }, include: { pcn: { include: { vehicle: true } }, challenge: true, delivery: true } });
  const managerEmail = appConfig.managerWeeklyReportRecipient;
  const hasPaymentReminders = reminders.some((reminder) => reminder.type === "PAYMENT_DEADLINE");
  const hasChallengeReminders = reminders.some((reminder) => reminder.type !== "PAYMENT_DEADLINE");
  if ((!adminEmail && !hasChallengeReminders) && (!managerEmail && !hasPaymentReminders)) {
    await finishJob(jobKey, "SKIPPED", "No reminder recipient is configured");
    return { status: "skipped" as const, reason: "missing-admin-email" };
  }
  let failures = 0;
  let configurationSkips = 0;
  for (const reminder of reminders) {
    const payment = reminder.type === "PAYMENT_DEADLINE";
    const recipient = payment ? managerEmail : adminEmail;
    if (!recipient) { configurationSkips += 1; continue; }
    const deliveryRecipient: string = recipient;
    try {
      const subject = payment ? `Payment deadline reminder: ${reminder.pcn.reference}` : `Challenge status check: ${reminder.pcn.reference}`;
      const body = payment ? `<p>Payment reminder for ${reminder.pcn.reference}, vehicle ${reminder.pcn.vehicle.registrationDisplay}.</p><p>Payment deadline: ${reminder.pcn.paymentDeadline ? formatDate(reminder.pcn.paymentDeadline) : "not recorded"}.</p>` : `<p>Status check reminder for ${reminder.pcn.reference}, vehicle ${reminder.pcn.vehicle.registrationDisplay}.</p><p>Review the challenge status manually with the issuer.</p>`;
      const sent = await sendEmail({ to: deliveryRecipient, subject, html: body });
      await prisma.$transaction([prisma.reminderDelivery.upsert({ where: { reminderId: reminder.id }, create: { reminderId: reminder.id, recipient: deliveryRecipient, status: "SENT", providerId: sent.id, attemptedAt: new Date(), sentAt: new Date(), attempts: 1 }, update: { recipient: deliveryRecipient, status: "SENT", providerId: sent.id, error: null, attemptedAt: new Date(), sentAt: new Date(), attempts: { increment: 1 } } }), prisma.reminder.update({ where: { id: reminder.id }, data: { status: "NOTIFIED", notifiedAt: new Date() } })]);
    } catch {
      failures += 1;
      await prisma.reminderDelivery.upsert({ where: { reminderId: reminder.id }, create: { reminderId: reminder.id, recipient: deliveryRecipient, status: "FAILED", error: "Email provider request failed", attemptedAt: new Date(), attempts: 1 }, update: { recipient: deliveryRecipient, status: "FAILED", error: "Email provider request failed", attemptedAt: new Date(), attempts: { increment: 1 } } });
    }
  }
  if (!reminders.length || (configurationSkips === reminders.length && !failures)) {
    const reason = !reminders.length ? "no-reminders-due" : hasPaymentReminders && !managerEmail ? "missing-manager-email" : "missing-admin-email";
    await finishJob(jobKey, "SKIPPED", !reminders.length ? "No reminders due" : "A reminder recipient is missing or invalid");
    return { status: "skipped" as const, reason };
  }
  const warning = configurationSkips ? "Some reminders were skipped because a configured recipient is missing or invalid" : undefined;
  await finishJob(jobKey, failures ? "FAILED" : "SUCCEEDED", failures ? "One or more reminder emails failed" : warning);
  return { status: failures ? "failed" as const : "succeeded" as const, count: reminders.length - configurationSkips, warning };
}
