import { CalendarDays, Download, FileBarChart } from "lucide-react";

import { generateReport } from "@/app/actions";
import { ReportEmailConfirmation } from "@/components/report-email-confirmation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatabaseFailure } from "@/components/database-failure";
import { appConfig } from "@/lib/config";
import { formatDate, reportingPeriod } from "@/lib/reporting";

export const dynamic = "force-dynamic";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ error?: string; generated?: string; sent?: string }> }) {
  let reports;
  try {
    const { prisma } = await import("@/lib/prisma");
    reports = await prisma.reportHistory.findMany({ include: { entries: true }, orderBy: { generatedAt: "desc" } });
  } catch (error) {
    return <DatabaseFailure error={error} operation="Report history load" retryPath="/reports" />;
  }
  const query = await searchParams;
  const weekly = reportingPeriod("WEEKLY"); const monthly = reportingPeriod("MONTHLY");
  const managerEmail = appConfig.managerWeeklyReportRecipient;
  const emailFrom = appConfig.emailFrom;
  return <main className="min-h-screen bg-slate-50"><header className="border-b bg-white"><div className="px-4 py-6 sm:px-6 lg:px-8"><p className="warm-eyebrow">Management reporting</p><h1 className="mt-1 text-3xl font-semibold">Reports</h1><p className="mt-1 text-sm text-slate-600">Generate clear weekly and monthly snapshots.</p></div></header><div className="space-y-6 px-4 py-8 sm:px-6 lg:px-8">{query.error && <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">{query.error}</p>}{(query.generated || query.sent) && <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{query.sent ? "Email accepted by the provider." : "Report generated. Existing period snapshots are reused."}</p>}<section className="grid gap-4 md:grid-cols-2"><ReportAction description={`Monday–Thursday · ${weekly.label}`} icon="weekly" title="Weekly report" type="WEEKLY" /><ReportAction description={`Calendar month · ${monthly.label}`} icon="monthly" title="Monthly report" type="MONTHLY" /></section><Card><CardHeader><CardTitle>Report history</CardTitle><p className="text-sm text-slate-600">A sent status means the email provider accepted the message; it does not confirm inbox delivery.</p>{!managerEmail && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">Sending is disabled because MANAGER_EMAIL is missing or invalid. Configure it in the server environment before sending reports or payment reminders.</p>}{managerEmail && !emailFrom && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">Sending is disabled because EMAIL_FROM is not configured. Configure the verified sender identity before sending reports.</p>}</CardHeader><CardContent>{reports.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b text-slate-500"><tr><th className="pb-3">Report</th><th className="pb-3">Period</th><th className="pb-3">Generated</th><th className="pb-3">Email</th><th className="pb-3" /></tr></thead><tbody>{reports.map((report) => <tr className="border-b border-slate-100" key={report.id}><td className="py-4 font-medium">{report.type === "WEEKLY" ? "Weekly" : "Monthly"}</td><td className="py-4">{formatDate(report.periodStart)} – {formatDate(report.periodEnd)}</td><td className="py-4">{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" }).format(report.generatedAt)}</td><td className="py-4">{report.emailDeliveryStatus === "SENT" ? "Accepted" : report.emailDeliveryStatus === "FAILED" ? "Failed" : "Not sent"}</td><td className="py-4"><div className="flex gap-3"><a className="inline-flex items-center gap-1 font-medium underline" href={`/api/reports/${report.id}/pdf`}><Download className="size-4" />PDF</a>{report.emailDeliveryStatus !== "SENT" && <ReportEmailConfirmation attachmentFilename={`${report.type === "WEEKLY" ? "sands-weekly-pcn-report" : "sands-monthly-pcn-report"}-${report.periodStart.toISOString().slice(0, 10)}.pdf`} emailFrom={emailFrom} managerEmail={managerEmail} periodEnd={formatDate(report.periodEnd)} periodStart={formatDate(report.periodStart)} reportId={report.id} reportType={report.type === "WEEKLY" ? "Weekly" : "Monthly"} subject={`${report.type === "WEEKLY" ? "Sands Weekly PCN Report" : "Sands Monthly PCN Report"} - ${formatDate(report.periodStart)} - ${formatDate(report.periodEnd)}`} />}</div></td></tr>)}</tbody></table></div> : <div className="empty-state"><FileBarChart className="size-8" /><strong>No reports yet</strong><span>Your generated reports will appear here.</span></div>}</CardContent></Card></div></main>;
}

function ReportAction({ title, description, type, icon }: { title: string; description: string; type: "WEEKLY" | "MONTHLY"; icon: "weekly" | "monthly" }) {
  const Icon = icon === "weekly" ? CalendarDays : FileBarChart;
  return <Card className="overflow-hidden"><CardHeader><div className="mb-3 flex size-11 items-center justify-center rounded-2xl bg-slate-100"><Icon className="size-5" /></div><CardTitle>{title}</CardTitle><p className="text-sm text-slate-600">{description}</p></CardHeader><CardContent><form action={generateReport}><input name="type" type="hidden" value={type} /><button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white" type="submit">Generate PDF</button></form></CardContent></Card>;
}
