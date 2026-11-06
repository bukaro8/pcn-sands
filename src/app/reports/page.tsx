import Link from "next/link";

import { generateReport, manuallySendReport } from "@/app/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatabaseFailure } from "@/components/database-failure";
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
  return <main className="min-h-screen bg-slate-50"><header className="border-b bg-white"><div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-5 sm:px-6"><Link className="text-sm text-slate-600 underline" href="/">Dashboard</Link><span className="text-slate-300">/</span><h1 className="text-xl font-semibold">Reports</h1></div></header><div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">{query.error && <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">{query.error}</p>}{(query.generated || query.sent) && <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{query.sent ? "Email accepted by the provider." : "Report generated. Existing period snapshots are reused."}</p>}<section className="grid gap-4 md:grid-cols-2"><ReportAction title="Generate Weekly Report" description={`Monday-Thursday: ${weekly.label}`} type="WEEKLY" /><ReportAction title="Generate Monthly Report" description={`Calendar month: ${monthly.label}`} type="MONTHLY" /></section><Card><CardHeader><CardTitle>Previous reports</CardTitle><p className="text-sm text-slate-600">A sent status means the email provider accepted the message; it does not confirm inbox delivery.</p></CardHeader><CardContent>{reports.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b text-slate-500"><tr><th className="pb-3">Report</th><th className="pb-3">Period</th><th className="pb-3">Generated</th><th className="pb-3">Email</th><th className="pb-3" /></tr></thead><tbody>{reports.map((report) => <tr className="border-b border-slate-100" key={report.id}><td className="py-3 font-medium">{report.type === "WEEKLY" ? "Weekly" : "Monthly"}</td><td className="py-3">{formatDate(report.periodStart)} - {formatDate(report.periodEnd)}</td><td className="py-3">{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" }).format(report.generatedAt)}</td><td className="py-3">{report.emailDeliveryStatus === "SENT" ? "Accepted" : report.emailDeliveryStatus === "FAILED" ? "Failed" : "Not sent"}</td><td className="py-3"><div className="flex gap-3"><a className="font-medium underline" href={`/api/reports/${report.id}/pdf`}>Download PDF</a>{report.emailDeliveryStatus !== "SENT" && <form action={manuallySendReport}><input name="reportId" type="hidden" value={report.id} /><button className="font-medium underline" type="submit">Send email</button></form>}</div></td></tr>)}</tbody></table></div> : <p className="text-sm text-slate-600">No reports generated yet.</p>}</CardContent></Card></div></main>;
}

function ReportAction({ title, description, type }: { title: string; description: string; type: "WEEKLY" | "MONTHLY" }) {
  return <Card><CardHeader><CardTitle>{title}</CardTitle><p className="text-sm text-slate-600">{description}</p></CardHeader><CardContent><form action={generateReport}><input name="type" type="hidden" value={type} /><button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white" type="submit">Generate report</button></form></CardContent></Card>;
}
