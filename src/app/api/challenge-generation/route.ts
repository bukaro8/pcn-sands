import { NextResponse } from "next/server";

import { appConfig } from "@/lib/config";
import { challengeGenerationSchema, parseChallengeGeneration } from "@/lib/challenge-generation";
import { temporaryEvidenceTypes, validateTemporaryEvidence } from "@/lib/temporary-upload";
import { isAdmin } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

const reasons = new Set(["LOADING_UNLOADING", "PARKING_RESTRICTION_SIGNAGE", "OTHER_CIRCUMSTANCES"]);
const evidenceOptions = new Set(["DELIVERY_INVOICE", "OTHER_SUPPORTING_EVIDENCE", "NO_ADDITIONAL_EVIDENCE"]);
const stages = new Set(["INITIAL", "FORMAL"]);

function field(formData: FormData, name: string): string { return String(formData.get(name) ?? "").trim(); }

export async function POST(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > appConfig.maxCaptureFileBytes + 50_000) return NextResponse.json({ error: "The request is too large." }, { status: 413 });
  const formData = await request.formData();
  const pcnId = field(formData, "pcnId");
  const reason = field(formData, "reason");
  const evidenceOption = field(formData, "evidenceOption");
  const stage = field(formData, "stage");
  const additionalCircumstances = field(formData, "additionalCircumstances");
  const evidenceFile = formData.get("evidence");
  if (!pcnId || !reasons.has(reason) || !evidenceOptions.has(evidenceOption) || !stages.has(stage)) return NextResponse.json({ error: "Challenge details are incomplete." }, { status: 400 });
  if (additionalCircumstances.length > 4000) return NextResponse.json({ error: "Additional circumstances are too long." }, { status: 400 });
  if (evidenceFile instanceof File) {
    const validationError = validateTemporaryEvidence(evidenceFile);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  }
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "AI generation is not configured. Write the challenge manually instead." }, { status: 503 });

  const { prisma } = await import("@/lib/prisma");
  const pcn = await prisma.pcn.findUnique({ where: { id: pcnId }, include: { vehicle: true, issuer: true, invoiceEvidence: true } });
  if (!pcn) return NextResponse.json({ error: "The PCN could not be found." }, { status: 404 });

  const pcnDetails = {
    reference: pcn.reference,
    vehicleRegistration: pcn.vehicle.registrationDisplay,
    issuerName: pcn.issuer.name,
    issuerType: pcn.issuer.type,
    contraventionCode: pcn.contraventionCode,
    contraventionLocation: pcn.contraventionLocation,
    contraventionDate: pcn.contraventionDate.toISOString().slice(0, 10),
    issueDate: pcn.issueDate.toISOString().slice(0, 10),
    noticeType: pcn.noticeType,
  };
  const invoice = pcn.invoiceEvidence ? { reference: pcn.invoiceEvidence.reference, invoiceDate: pcn.invoiceEvidence.invoiceDate?.toISOString().slice(0, 10), deliveryDate: pcn.invoiceEvidence.deliveryDate?.toISOString().slice(0, 10), deliveryAddress: pcn.invoiceEvidence.deliveryAddress, billingAddress: pcn.invoiceEvidence.billingAddress, recipient: pcn.invoiceEvidence.recipient, supplier: pcn.invoiceEvidence.supplier, description: pcn.invoiceEvidence.description, deliveryTime: pcn.invoiceEvidence.deliveryTime, otherFacts: pcn.invoiceEvidence.otherFacts } : null;
  const content: Array<Record<string, string>> = [{ type: "input_text", text: `Draft a concise, professional challenge in British English for manual submission. This is a ${stage.toLowerCase()} challenge to a ${pcn.issuer.type.toLowerCase()} issuer. Selected reason: ${reason}. Evidence selection: ${evidenceOption}. Additional circumstances: ${additionalCircumstances || "None supplied"}. Verified PCN: ${JSON.stringify(pcnDetails)}. Reviewed invoice facts: ${JSON.stringify(invoice)}. Invoice date is not proof of delivery; billing address is not delivery address. Flag inconsistent dates and missing facts. Only state facts in these details. Do not invent loading, delivery times, legal grounds or an exemption. Request cancellation and list material missing information separately.` }];

  if (evidenceFile instanceof File) {
    const data = Buffer.from(await evidenceFile.arrayBuffer()).toString("base64");
    if (temporaryEvidenceTypes.has(evidenceFile.type)) {
      content.push(evidenceFile.type === "application/pdf"
        ? { type: "input_file", filename: evidenceFile.name || "evidence.pdf", file_data: `data:${evidenceFile.type};base64,${data}`, detail: "high" }
        : { type: "input_image", image_url: `data:${evidenceFile.type};base64,${data}`, detail: "high" });
    }
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: appConfig.openAiModel, store: false, input: [{ role: "user", content }], text: { format: { type: "json_schema", name: "pcn_challenge", strict: true, schema: challengeGenerationSchema }, verbosity: "low" } }),
  });
  if (!response.ok) return NextResponse.json({ error: "The AI service could not generate a challenge. You can write one manually." }, { status: 502 });
  const payload = await response.json() as { output_text?: string };
  try { return NextResponse.json({ generation: parseChallengeGeneration(JSON.parse(payload.output_text ?? "")) }); }
  catch { return NextResponse.json({ error: "The AI response was incomplete. You can write a challenge manually." }, { status: 502 }); }
}
