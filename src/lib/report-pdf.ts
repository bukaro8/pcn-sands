import { statusLabel } from "@/lib/pcn";
import { formatDate, noticeLabel, reportForPdf } from "@/lib/reporting";

type Rgb = readonly [number, number, number];
type Page = string[];

const colour = {
  paper: [0.984, 0.973, 0.929] as Rgb,
  forest: [0.09, 0.24, 0.2] as Rgb,
  sage: [0.35, 0.53, 0.38] as Rgb,
  sageSoft: [0.87, 0.91, 0.86] as Rgb,
  amber: [0.76, 0.55, 0.24] as Rgb,
  amberSoft: [0.95, 0.9, 0.78] as Rgb,
  terracotta: [0.67, 0.32, 0.25] as Rgb,
  terracottaSoft: [0.94, 0.86, 0.82] as Rgb,
  ink: [0.14, 0.22, 0.19] as Rgb,
  muted: [0.4, 0.46, 0.42] as Rgb,
  line: [0.83, 0.84, 0.8] as Rgb,
  white: [1, 1, 1] as Rgb,
};

const rgb = ([red, green, blue]: Rgb) => `${red} ${green} ${blue}`;
const clean = (value: string) => value.normalize("NFKD").replace(/[^\x20-\xFF]/g, "?");
const escapePdf = (value: string) => clean(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

function text(page: Page, value: string, x: number, y: number, size = 10, font: "regular" | "bold" = "regular", fill: Rgb = colour.ink) {
  page.push("BT", `/F${font === "bold" ? 2 : 1} ${size} Tf`, `${rgb(fill)} rg`, `${x} ${y} Td`, `(${escapePdf(value)}) Tj`, "ET");
}

function rectangle(page: Page, x: number, y: number, width: number, height: number, fill: Rgb, stroke?: Rgb) {
  page.push("q", `${rgb(fill)} rg`);
  if (stroke) page.push(`${rgb(stroke)} RG`, "0.7 w");
  page.push(`${x} ${y} ${width} ${height} re`, stroke ? "B" : "f", "Q");
}

function rule(page: Page, x1: number, y1: number, x2: number, y2: number, stroke = colour.line, width = 0.7) {
  page.push("q", `${rgb(stroke)} RG`, `${width} w`, `${x1} ${y1} m`, `${x2} ${y2} l`, "S", "Q");
}

function wrap(value: string, maxCharacters: number) {
  const words = value.split(/\s+/); const lines: string[] = []; let current = "";
  for (const word of words) {
    if (`${current} ${word}`.trim().length > maxCharacters && current) { lines.push(current); current = word; }
    else current = `${current} ${word}`.trim();
  }
  if (current) lines.push(current);
  return lines;
}

function ringSlice(page: Page, centerX: number, centerY: number, outer: number, inner: number, start: number, end: number, fill: Rgb) {
  const span = Math.abs(end - start);
  const steps = Math.max(8, Math.ceil((span / (Math.PI * 2)) * 72));
  const outerPoints = Array.from({ length: steps + 1 }, (_, index) => {
    const angle = start + ((end - start) * index) / steps;
    return [centerX + outer * Math.cos(angle), centerY + outer * Math.sin(angle)];
  });
  const innerPoints = Array.from({ length: steps + 1 }, (_, index) => {
    const angle = end - ((end - start) * index) / steps;
    return [centerX + inner * Math.cos(angle), centerY + inner * Math.sin(angle)];
  });
  const [firstX, firstY] = outerPoints[0];
  page.push("q", `${rgb(fill)} rg`, `${firstX.toFixed(2)} ${firstY.toFixed(2)} m`);
  for (const [x, y] of [...outerPoints.slice(1), ...innerPoints]) page.push(`${x.toFixed(2)} ${y.toFixed(2)} l`);
  page.push("h", "f", "Q");
}

function donut(page: Page, values: Array<{ count: number; fill: Rgb }>, centerX: number, centerY: number) {
  const total = values.reduce((sum, value) => sum + value.count, 0);
  if (!total) {
    ringSlice(page, centerX, centerY, 87, 53, Math.PI / 2, Math.PI / 2 - Math.PI * 2, colour.line);
    return;
  }
  let angle = Math.PI / 2;
  for (const value of values.filter((item) => item.count > 0)) {
    const next = angle - (value.count / total) * Math.PI * 2;
    ringSlice(page, centerX, centerY, 87, 53, angle, next, value.fill);
    angle = next;
  }
}

function formatAmount(pence: number | null) {
  return pence == null ? "Not recorded" : new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
}

function addContinuationHeader(page: Page, reportName: string, period: string, section: string) {
  text(page, "PCA · PCN Coordination", 42, 803, 8, "bold", colour.sage);
  text(page, reportName, 42, 775, 18, "bold", colour.forest);
  text(page, period, 42, 757, 9, "regular", colour.muted);
  rule(page, 42, 741, 553, 741);
  text(page, section, 42, 712, 15, "bold", colour.forest);
}

export async function buildReportPdf(reportId: string): Promise<Uint8Array | null> {
  const data = await reportForPdf(reportId); if (!data) return null;
  const { report, submitted, accepted, rejected, pending, outcomeCounts, outcomeTotal, successRate } = data;
  const reportName = report.type === "WEEKLY" ? "Sands Weekly PCN Report" : "Sands Monthly PCN Report";
  const period = `${formatDate(report.periodStart)} - ${formatDate(report.periodEnd)}`;
  const generated = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" }).format(report.generatedAt);
  const payments = report.entries.filter((entry) => entry.paymentNoticeNumber && entry.paymentStatus !== "PAID");
  const pages: Page[] = [[]];
  const first = pages[0];

  rectangle(first, 0, 0, 595, 842, colour.paper);
  text(first, "PCA · PCN Coordination", 42, 803, 8, "bold", colour.sage);
  text(first, reportName, 42, 766, 25, "bold", colour.forest);
  text(first, period, 42, 742, 11, "regular", colour.muted);
  text(first, `Generated ${generated}`, 414, 803, 8, "regular", colour.muted);

  rectangle(first, 42, 440, 511, 275, colour.white, colour.line);
  text(first, "CHALLENGE POSITION", 64, 684, 8, "bold", colour.sage);
  text(first, "Overall recorded outcomes", 64, 660, 16, "bold", colour.forest);
  text(first, "One current status per PCN at the reporting date", 64, 643, 8, "regular", colour.muted);
  donut(first, [
    { count: outcomeCounts.awaiting, fill: colour.amber },
    { count: outcomeCounts.accepted, fill: colour.sage },
    { count: outcomeCounts.rejected, fill: colour.terracotta },
  ], 168, 548);
  const totalText = String(outcomeTotal);
  text(first, totalText, 168 - totalText.length * 8, 544, 26, "bold", colour.forest);
  text(first, "TOTAL CASES", 140, 524, 7, "bold", colour.muted);

  const legend = [
    { label: "Awaiting decision", count: outcomeCounts.awaiting, fill: colour.amber, soft: colour.amberSoft },
    { label: "Accepted", count: outcomeCounts.accepted, fill: colour.sage, soft: colour.sageSoft },
    { label: "Rejected", count: outcomeCounts.rejected, fill: colour.terracotta, soft: colour.terracottaSoft },
  ];
  legend.forEach((item, index) => {
    const y = 604 - index * 57;
    rectangle(first, 292, y - 17, 231, 43, item.soft);
    rectangle(first, 305, y - 4, 10, 10, item.fill);
    text(first, item.label, 326, y, 10, "bold", colour.ink);
    text(first, String(item.count), 493, y - 1, 14, "bold", colour.forest);
  });
  if (!outcomeTotal) text(first, "No submitted cases or recorded decisions in this snapshot.", 292, 458, 8, "regular", colour.muted);

  const kpis = [
    { value: submitted, label: "NEW SUBMISSIONS" },
    { value: accepted, label: "ACCEPTED DECISIONS" },
    { value: rejected, label: "REJECTED DECISIONS" },
    { value: pending, label: "AWAITING DECISION" },
    ...(report.type === "MONTHLY" ? [{ value: successRate == null ? "-" : `${successRate}%`, label: "SUCCESS RATE" }] : []),
  ];
  const gap = 8; const boxWidth = (511 - gap * (kpis.length - 1)) / kpis.length;
  kpis.forEach((item, index) => {
    const x = 42 + index * (boxWidth + gap);
    rectangle(first, x, 354, boxWidth, 66, colour.white, colour.line);
    text(first, String(item.value), x + 12, 385, 20, "bold", colour.forest);
    for (const [lineIndex, line] of wrap(item.label, 17).entries()) text(first, line, x + 12, 367 - lineIndex * 9, 6.5, "bold", colour.muted);
  });

  let page = first; let y = 322;
  const newPage = (section: string) => {
    page = []; pages.push(page); rectangle(page, 0, 0, 595, 842, colour.paper); addContinuationHeader(page, reportName, period, section); y = 684;
  };
  const sectionHeading = (title: string, subtitle: string) => {
    text(page, title, 42, y, 15, "bold", colour.forest); y -= 18;
    text(page, subtitle, 42, y, 8, "regular", colour.muted); y -= 18;
    rule(page, 42, y, 553, y); y -= 15;
  };

  sectionHeading("Management actions", "Outstanding payments remain listed until explicitly confirmed as paid.");
  if (!payments.length) {
    rectangle(page, 42, y - 49, 511, 49, colour.sageSoft);
    text(page, "No outstanding payment actions in this report.", 58, y - 29, 10, "bold", colour.forest);
    y -= 69;
  }
  for (const entry of payments) {
    if (y < 126) newPage("Management actions - continued");
    const overdue = Boolean(entry.paymentDeadline && entry.paymentDeadline < report.generatedAt);
    rectangle(page, 42, y - 78, 511, 78, colour.white, overdue ? colour.terracotta : colour.line);
    text(page, entry.pcn.vehicle.registrationDisplay, 58, y - 27, 18, "bold", colour.forest);
    text(page, `PCN ${entry.pcn.reference}`, 58, y - 46, 8, "regular", colour.muted);
    text(page, noticeLabel(entry.paymentNoticeNumber).toUpperCase(), 58, y - 63, 7, "bold", overdue ? colour.terracotta : colour.sage);
    text(page, formatAmount(entry.paymentAmountPence), 310, y - 25, 13, "bold", colour.ink);
    text(page, `Payment deadline: ${entry.paymentDeadline ? formatDate(entry.paymentDeadline) : "not recorded"}`, 310, y - 44, 9, "regular", overdue ? colour.terracotta : colour.ink);
    text(page, `${statusLabel(entry.paymentStatus)}${overdue ? " · OVERDUE" : ""}`, 310, y - 62, 8, "bold", overdue ? colour.terracotta : colour.muted);
    y -= 90;
  }

  y -= 12;
  if (y < 125) newPage("Case status register");
  else sectionHeading("Case status register", "Current challenge position for each PCN included in this report.");
  if (!report.entries.length) {
    text(page, "No PCNs were included for this reporting period.", 42, y - 8, 10, "regular", colour.muted);
  } else {
    text(page, "VEHICLE", 48, y, 7, "bold", colour.muted);
    text(page, "PCN REFERENCE", 190, y, 7, "bold", colour.muted);
    text(page, "CURRENT STATUS", 424, y, 7, "bold", colour.muted); y -= 13;
    for (const entry of report.entries) {
      if (y < 90) { newPage("Case status register - continued"); text(page, "VEHICLE", 48, y, 7, "bold", colour.muted); text(page, "PCN REFERENCE", 190, y, 7, "bold", colour.muted); text(page, "CURRENT STATUS", 424, y, 7, "bold", colour.muted); y -= 13; }
      rectangle(page, 42, y - 36, 511, 40, colour.white, colour.line);
      text(page, entry.pcn.vehicle.registrationDisplay, 48, y - 10, 9, "bold", colour.forest);
      text(page, entry.pcn.reference, 190, y - 10, 8, "regular", colour.ink);
      const compactStatus = entry.challengeStatus === "AWAITING_DECISION" ? "Awaiting decision" : entry.challengeStatus === "AWAITING_CHALLENGE" ? "Awaiting challenge" : statusLabel(entry.challengeStatus);
      text(page, compactStatus, 424, y - 10, 8, "bold", entry.challengeStatus === "ACCEPTED" ? colour.sage : entry.challengeStatus === "REJECTED" ? colour.terracotta : colour.amber);
      if (entry.nextStatusCheckDate) text(page, `Next status check: ${formatDate(entry.nextStatusCheckDate)}`, 190, y - 26, 7, "regular", colour.muted);
      y -= 44;
    }
  }

  pages.forEach((current, index) => {
    rule(current, 42, 45, 553, 45);
    text(current, "PCA · PCN Coordination", 42, 28, 7, "bold", colour.muted);
    text(current, `Page ${index + 1} of ${pages.length}`, 493, 28, 7, "regular", colour.muted);
  });

  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ];
  const pageObjects: number[] = []; const contentObjects: number[] = [];
  for (const commands of pages) {
    pageObjects.push(objects.length + 1); objects.push("");
    contentObjects.push(objects.length + 1);
    const stream = commands.join("\n");
    objects.push(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
  }
  objects[1] = `<< /Type /Pages /Kids [${pageObjects.map((number) => `${number} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  pageObjects.forEach((objectNumber, index) => {
    objects[objectNumber - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjects[index]} 0 R >>`;
  });
  let pdf = "%PDF-1.4\n"; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf, "latin1")); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const start = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return new Uint8Array(Buffer.from(pdf, "latin1"));
}
