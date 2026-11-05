import { isAdmin } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdmin()) return new Response("Unauthorized", { status: 401, headers: { "Cache-Control": "no-store" } });
  const { id } = await params;
  const { buildReportPdf } = await import("@/lib/report-pdf");
  const pdf = await buildReportPdf(id);
  if (!pdf) return new Response("Report not found", { status: 404 });
  return new Response(Buffer.from(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="pcn-report-${id}.pdf"`, "Cache-Control": "private, no-store" } });
}
