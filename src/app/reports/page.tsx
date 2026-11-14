import { CalendarDays, Download, FileBarChart } from "lucide-react";

import { generateReport } from "@/app/actions";
import { DatabaseFailure } from "@/components/database-failure";
import { ReportEmailConfirmation } from "@/components/report-email-confirmation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { appConfig } from "@/lib/config";
import { formatDate, reportingPeriod } from "@/lib/reporting";

export const dynamic = "force-dynamic";

const generatedAtFormatter = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" });

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ error?: string; generated?: string; sent?: string }> }) {
  let reports;
  try {
    const { prisma } = await import("@/lib/prisma");
    reports = await prisma.reportHistory.findMany({ orderBy: { generatedAt: "desc" } });
  } catch (error) {
    return <DatabaseFailure error={error} operation="Report history load" retryPath="/reports" />;
  }
  const query = await searchParams;
  const weekly = reportingPeriod("WEEKLY");
  const monthly = reportingPeriod("MONTHLY");
  const managerEmail = appConfig.managerWeeklyReportRecipient;
  const emailFrom = appConfig.emailFrom;

  return <main className="min-h-screen bg-slate-50">
    <header className="border-b bg-white"><div className="px-4 py-6 sm:px-6 lg:px-8"><p className="warm-eyebrow">Management reporting</p><h1 className="mt-1 text-3xl font-semibold">Reports</h1><p className="mt-1 text-sm text-slate-600">Generate clear weekly and monthly snapshots.</p></div></header>
    <div className="space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      {query.error && <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">{query.error}</p>}
      {(query.generated || query.sent) && <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{query.sent ? "A fresh report was generated and its email was accepted by the provider." : "A new report version was generated from the latest PCN data."}</p>}
      <section className="grid gap-4 md:grid-cols-2"><ReportAction description={`Monday–Thursday · ${weekly.label}`} icon="weekly" title="Weekly report" type="WEEKLY" /><ReportAction description={`Calendar month · ${monthly.label}`} icon="monthly" title="Monthly report" type="MONTHLY" /></section>
      <Card>
        <CardHeader><CardTitle>Report history</CardTitle><p className="text-sm text-slate-600">Every generation is retained as a separate snapshot. The reporting period and generation time are shown independently.</p><p className="text-sm text-slate-600">A sent status means the email provider accepted the message; it does not confirm inbox delivery.</p>{!managerEmail && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">Sending is disabled because MANAGER_EMAIL is missing or invalid. Configure it in the server environment before sending reports or payment reminders.</p>}{managerEmail && !emailFrom && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">Sending is disabled because EMAIL_FROM is not configured. Configure the verified sender identity before sending reports.</p>}</CardHeader>
        <CardContent>{reports.length ? <>
          <div className="space-y-3 md:hidden">{reports.map((report) => <article className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-4" key={report.id}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{report.type === "WEEKLY" ? "Weekly report" : "Monthly report"}</p><p className="mt-1 text-sm text-[var(--muted)]">Reporting period: {formatDate(report.periodStart)} – {formatDate(report.periodEnd)}</p></div><span className="rounded-full bg-[var(--primary-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--primary)]">{emailStatus(report.emailDeliveryStatus)}</span></div><p className="mt-3 text-xs text-[var(--muted)]">Generated: {generatedAtFormatter.format(report.generatedAt)}</p><div className="mt-4"><ReportActions emailFrom={emailFrom} managerEmail={managerEmail} report={report} /></div></article>)}</div>
          <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[820px] text-left text-sm"><thead className="border-b text-slate-500"><tr><th className="pb-3">Report</th><th className="pb-3">Reporting period</th><th className="pb-3">Generated at (UK)</th><th className="pb-3">Email</th><th className="pb-3" /></tr></thead><tbody>{reports.map((report) => <tr className="border-b border-slate-100" key={report.id}><td className="py-4 font-medium">{report.type === "WEEKLY" ? "Weekly" : "Monthly"}</td><td className="py-4">{formatDate(report.periodStart)} – {formatDate(report.periodEnd)}</td><td className="py-4">{generatedAtFormatter.format(report.generatedAt)}</td><td className="py-4">{emailStatus(report.emailDeliveryStatus)}</td><td className="py-4"><ReportActions emailFrom={emailFrom} managerEmail={managerEmail} report={report} /></td></tr>)}</tbody></table></div>
        </> : <div className="empty-state"><FileBarChart className="size-8" /><strong>No reports yet</strong><span>Your generated reports will appear here.</span></div>}</CardContent>
      </Card>
    </div>
  </main>;
}

function ReportAction({ title, description, type, icon }: { title: string; description: string; type: "WEEKLY" | "MONTHLY"; icon: "weekly" | "monthly" }) {
  const Icon = icon === "weekly" ? CalendarDays : FileBarChart;
  return <Card className="overflow-hidden"><CardHeader><div className="mb-3 flex size-11 items-center justify-center rounded-2xl bg-slate-100"><Icon className="size-5" /></div><CardTitle>{title}</CardTitle><p className="text-sm text-slate-600">{description}</p></CardHeader><CardContent><form action={generateReport}><input name="type" type="hidden" value={type} /><button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white" type="submit">Generate new PDF</button></form></CardContent></Card>;
}

type ReportActionRecord = { id: string; type: "WEEKLY" | "MONTHLY"; periodStart: Date; periodEnd: Date };

function ReportActions({ report, managerEmail, emailFrom }: { report: ReportActionRecord; managerEmail?: string; emailFrom?: string }) {
  const reportLabel = report.type === "WEEKLY" ? "Sands Weekly PCN Report" : "Sands Monthly PCN Report";
  return <div className="flex flex-wrap items-center gap-4"><a className="min-h-11 content-center font-medium underline" href={`/api/reports/${report.id}/pdf`} rel="noopener" target="_blank">View</a><a className="inline-flex min-h-11 items-center gap-1 font-medium underline" download href={`/api/reports/${report.id}/pdf?download=1`}><Download className="size-4" />Download</a><ReportEmailConfirmation attachmentFilename={`${report.type === "WEEKLY" ? "sands-weekly-pcn-report" : "sands-monthly-pcn-report"}-${report.periodStart.toISOString().slice(0, 10)}.pdf`} emailFrom={emailFrom} managerEmail={managerEmail} periodEnd={formatDate(report.periodEnd)} periodStart={formatDate(report.periodStart)} reportId={report.id} reportType={report.type === "WEEKLY" ? "Weekly" : "Monthly"} subject={`${reportLabel} - ${formatDate(report.periodStart)} - ${formatDate(report.periodEnd)}`} /></div>;
}

function emailStatus(status: string) {
  return status === "SENT" ? "Accepted" : status === "FAILED" ? "Failed" : "Not sent";
}
