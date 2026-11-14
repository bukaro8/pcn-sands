type PdfResponseOptions = {
  pdf: Uint8Array;
  filename: string;
  download: boolean;
  rangeHeader?: string | null;
  headOnly?: boolean;
};

export function isReportPdfPath(pathname: string) {
  return /^\/api\/reports\/[^/]+\/pdf$/.test(pathname);
}

function safeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function byteRange(rangeHeader: string | null | undefined, size: number) {
  if (!rangeHeader) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match || (!match[1] && !match[2])) return "invalid" as const;
  let start: number;
  let end: number;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return "invalid" as const;
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) return "invalid" as const;
  return { start, end: Math.min(end, size - 1) };
}

export function pdfResponse({ pdf, filename, download, rangeHeader, headOnly = false }: PdfResponseOptions) {
  const safe = safeFilename(filename);
  const disposition = download ? "attachment" : "inline";
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store, max-age=0",
    "Content-Disposition": `${disposition}; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`,
    "Content-Type": "application/pdf",
    "X-Content-Type-Options": "nosniff",
  });
  const range = byteRange(rangeHeader, pdf.byteLength);
  if (range === "invalid") {
    headers.set("Content-Range", `bytes */${pdf.byteLength}`);
    return new Response(null, { status: 416, headers });
  }
  if (range) {
    const body = pdf.slice(range.start, range.end + 1);
    headers.set("Content-Length", String(body.byteLength));
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${pdf.byteLength}`);
    return new Response(headOnly ? null : Buffer.from(body), { status: 206, headers });
  }
  headers.set("Content-Length", String(pdf.byteLength));
  return new Response(headOnly ? null : Buffer.from(pdf), { status: 200, headers });
}
