import { isReportPdfPath, pdfResponse } from "../src/lib/pdf-response";

const pdf = new TextEncoder().encode("%PDF-1.7 fictional mobile report");

async function main() {
  const inline = pdfResponse({ pdf, filename: "weekly report.pdf", download: false });
  if (inline.status !== 200 || inline.headers.get("content-type") !== "application/pdf" || !inline.headers.get("content-disposition")?.startsWith("inline;") || inline.headers.get("accept-ranges") !== "bytes" || inline.headers.get("cache-control") !== "private, no-store, max-age=0") throw new Error("Inline mobile PDF headers are invalid");
  if ((await inline.arrayBuffer()).byteLength !== pdf.byteLength) throw new Error("Inline PDF response was truncated");

  const download = pdfResponse({ pdf, filename: "monthly report.pdf", download: true });
  if (!download.headers.get("content-disposition")?.startsWith("attachment;") || !download.headers.get("content-disposition")?.includes("monthly-report.pdf")) throw new Error("Download disposition is invalid");

  const partial = pdfResponse({ pdf, filename: "report.pdf", download: false, rangeHeader: "bytes=0-7" });
  if (partial.status !== 206 || partial.headers.get("content-range") !== `bytes 0-7/${pdf.byteLength}` || partial.headers.get("content-length") !== "8") throw new Error("Mobile byte-range response is invalid");
  if (new TextDecoder().decode(await partial.arrayBuffer()) !== "%PDF-1.7") throw new Error("Byte-range response returned the wrong content");

  const invalid = pdfResponse({ pdf, filename: "report.pdf", download: false, rangeHeader: "bytes=999-1000" });
  if (invalid.status !== 416 || invalid.headers.get("content-range") !== `bytes */${pdf.byteLength}`) throw new Error("Invalid ranges are not rejected safely");
  if (!isReportPdfPath("/api/reports/report-id/pdf") || isReportPdfPath("/api/private/data")) throw new Error("Authenticated browser-download route detection failed");

  console.log("Inline viewing, attachment downloads, byte ranges and authenticated report route detection passed");
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
