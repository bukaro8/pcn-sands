import { NextResponse } from "next/server";

import { appConfig } from "@/lib/config";
import { extractionJsonSchema, parseExtractedPcn } from "@/lib/pcn-extraction";
import { isAdmin } from "@/lib/require-admin";

const acceptedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const acceptedDocumentTypes = new Set(["application/pdf"]);
const heicTypes = new Set(["image/heic", "image/heif"]);

export async function POST(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > appConfig.maxCaptureFileBytes + 50_000) return NextResponse.json({ error: "The request is too large." }, { status: 413 });
  const formData = await request.formData();
  const file = formData.get("document");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Select a PCN photograph or PDF." }, { status: 400 });
  if (file.size > appConfig.maxCaptureFileBytes) return NextResponse.json({ error: "The file is larger than 10 MB. Use a smaller or compressed copy." }, { status: 413 });
  if (heicTypes.has(file.type)) return NextResponse.json({ error: "HEIC/HEIF is not supported by the configured extraction API. Convert it to JPEG or PNG first." }, { status: 415 });
  if (!acceptedImageTypes.has(file.type) && !acceptedDocumentTypes.has(file.type)) return NextResponse.json({ error: "Use a JPG, PNG, WebP or PDF document." }, { status: 415 });
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "AI extraction is not configured. Complete the manual form instead." }, { status: 503 });

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const content = acceptedDocumentTypes.has(file.type)
    ? [{ type: "input_file", filename: file.name || "pcn.pdf", file_data: `data:${file.type};base64,${base64}` }]
    : [{ type: "input_image", image_url: `data:${file.type};base64,${base64}`, detail: "high" }];

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: appConfig.openAiModel,
      store: false,
      input: [{ role: "user", content: [{ type: "input_text", text: "Extract only facts visibly present in this UK PCN document. Return null for unavailable or uncertain fields. Dates must be YYYY-MM-DD. Map the notice type to ORIGINAL_PCN, NOTICE_TO_OWNER, PRIVATE_PARKING_NOTICE, or OTHER. Separate the discounted amount and deadline from the full amount and deadline. Never assume a 14-day period. Set discountPeriodDays and discountPeriodStartDate only when both are explicitly and unambiguously stated; count the start date as day 1 when calculating discountDeadline. Do not infer a service date, amount, or deadline from customary rules." }, ...content] }],
      text: { format: { type: "json_schema", name: "pcn_extraction", strict: true, schema: extractionJsonSchema } },
    }),
  });
  if (!response.ok) return NextResponse.json({ error: "The extraction service could not process this document. You can still enter it manually." }, { status: 502 });

  const payload = await response.json() as { output_text?: string };
  try {
    return NextResponse.json({ extraction: parseExtractedPcn(JSON.parse(payload.output_text ?? "")) });
  } catch {
    return NextResponse.json({ error: "The extraction response was incomplete. Complete the manual form instead." }, { status: 502 });
  }
}
