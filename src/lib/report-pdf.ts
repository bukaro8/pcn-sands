import { formatDate, noticeLabel, reportForPdf } from "@/lib/reporting";
import { statusLabel } from "@/lib/pcn";

function escapePdf(value: string) { return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)"); }

function wrap(text: string, length = 88) {
  const words = text.split(/\s+/); const lines: string[] = []; let line = "";
  for (const word of words) { if (`${line} ${word}`.trim().length > length) { lines.push(line); line = word; } else line = `${line} ${word}`.trim(); }
  if (line) lines.push(line); return lines;
}

export async function buildReportPdf(reportId: string): Promise<Uint8Array | null> {
  const data = await reportForPdf(reportId); if (!data) return null;
  const { report, submitted, accepted, rejected, pending } = data;
  const lines: Array<{ text: string; bold?: boolean; color?: string }> = [
    { text: `${report.type === "WEEKLY" ? "Weekly" : "Monthly"} report: ${formatDate(report.periodStart)} - ${formatDate(report.periodEnd)}` },
    { text: `Generated: ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" }).format(report.generatedAt)}` },
    { text: "Challenge results", bold: true, color: "0.12 0.20 0.33" },
    { text: `Submitted: ${submitted}    Accepted: ${accepted}    Rejected: ${rejected}    Pending: ${pending}` },
    { text: "Relevant PCNs", bold: true, color: "0.12 0.20 0.33" },
  ];
  for (const entry of report.entries) lines.push({ text: `${entry.pcn.reference} | ${entry.pcn.vehicle.registrationDisplay} | ${statusLabel(entry.challengeStatus)}` });
  const payments = report.entries.filter((entry) => entry.paymentNoticeNumber);
  lines.push({ text: "Actions required - outstanding payments", bold: true, color: "0.55 0.10 0.10" });
  if (!payments.length) lines.push({ text: "No outstanding payments in this report." });
  for (const entry of payments) {
    const overdue = entry.paymentDeadline && entry.paymentDeadline < report.generatedAt && entry.paymentStatus !== "PAID";
    lines.push({ text: `${entry.pcn.reference} | ${entry.pcn.vehicle.registrationDisplay} | Due ${entry.paymentDeadline ? formatDate(entry.paymentDeadline) : "not known"} | ${statusLabel(entry.paymentStatus)} | ${overdue ? "OVERDUE" : "Current"} | ${noticeLabel(entry.paymentNoticeNumber)}` });
  }
  const pages: string[][] = [[]]; let count = 0;
  for (const item of lines) for (const line of wrap(item.text)) { if (count >= 43) { pages.push([]); count = 0; } pages.at(-1)?.push(`${item.bold ? "B" : "R"}\u0001${item.color ?? "0.2 0.2 0.2"}\u0001${line}`); count += item.bold ? 2 : 1; }
  const objects: string[] = ["<< /Type /Catalog /Pages 2 0 R >>", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"];
  const pageObjectNumbers: number[] = []; const contentObjectNumbers: number[] = [];
  for (let index = 0; index < pages.length; index += 1) { pageObjectNumbers.push(objects.length + 1); objects.push(""); contentObjectNumbers.push(objects.length + 1); const commands = ["BT", "/F2 16 Tf", "50 780 Td", "(Sands PCN Management) Tj", "ET"]; let y = 750; for (const row of pages[index]) { const [font, color, text] = row.split("\u0001"); commands.push("BT", `/F${font === "B" ? 2 : 1} ${font === "B" ? 11 : 9} Tf`, `${color} rg`, `50 ${y} Td`, `(${escapePdf(text)}) Tj`, "ET"); y -= font === "B" ? 20 : 14; } commands.push("BT", "/F1 8 Tf", "0.4 0.4 0.4 rg", `50 32 Td`, `(Page ${index + 1} of ${pages.length}) Tj`, "ET"); const stream = commands.join("\n"); objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`); }
  objects[1] = `<< /Type /Pages /Kids [${pageObjectNumbers.map((number) => `${number} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  for (let index = 0; index < pages.length; index += 1) objects[pageObjectNumbers[index] - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectNumbers[index]} 0 R >>`;
  let pdf = "%PDF-1.4\n"; const offsets = [0]; for (let index = 0; index < objects.length; index += 1) { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`; } const start = Buffer.byteLength(pdf); pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return new Uint8Array(Buffer.from(pdf));
}
