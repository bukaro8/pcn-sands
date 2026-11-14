import { isAdmin } from "@/lib/require-admin";
import { pdfResponse } from "@/lib/pdf-response";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function serveReport(request: Request, params: Promise<{ id: string }>, headOnly = false) {
  if (!await isAdmin()) return new Response("Unauthorized", { status: 401, headers: { "Cache-Control": "no-store" } });
  const { id } = await params;
  const report = await prisma.reportHistory.findUnique({ where: { id }, select: { type: true, periodStart: true } });
  if (!report) return new Response("Report not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const { buildReportPdf } = await import("@/lib/report-pdf");
  const pdf = await buildReportPdf(id);
  if (!pdf) return new Response("Report not found", { status: 404 });
  const url = new URL(request.url);
  const label = report.type === "WEEKLY" ? "weekly" : "monthly";
  const filename = `sands-${label}-pcn-report-${report.periodStart.toISOString().slice(0, 10)}-${id.slice(-6)}.pdf`;
  return pdfResponse({ pdf, filename, download: url.searchParams.get("download") === "1", rangeHeader: request.headers.get("range"), headOnly });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) { return serveReport(request, params); }
export async function HEAD(request: Request, { params }: { params: Promise<{ id: string }> }) { return serveReport(request, params, true); }
