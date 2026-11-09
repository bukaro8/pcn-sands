import { NextResponse } from "next/server";

import { appConfig } from "@/lib/config";
import { ChallengeResponseError, challengeGenerationSchema, parseOpenAiChallengeResponse } from "@/lib/challenge-generation";
import { temporaryEvidenceTypes, validateTemporaryEvidence } from "@/lib/temporary-upload";
import { isAdmin } from "@/lib/require-admin";
import { classifyDatabaseError, logDatabaseError } from "@/lib/database-errors";
import { analyzeDeliveryEvidence, extractContraventionTime } from "@/lib/delivery-evidence";
import { buildChallengeWritingPrompt, challengeQualityReport, type ChallengeWritingInput } from "@/lib/challenge-writing";

export const dynamic = "force-dynamic";

const reasons = new Set(["LOADING_UNLOADING", "PARKING_RESTRICTION_SIGNAGE", "OTHER_CIRCUMSTANCES"]);
const evidenceOptions = new Set(["DELIVERY_INVOICE", "OTHER_SUPPORTING_EVIDENCE", "NO_ADDITIONAL_EVIDENCE"]);
const stages = new Set(["INITIAL", "FORMAL"]);

function field(formData: FormData, name: string): string { return String(formData.get(name) ?? "").trim(); }

async function handlePost(request: Request) {
  try {
    if (!await isAdmin()) return NextResponse.json({ error: "Your session has expired. Sign in again, then retry." }, { status: 401 });
  } catch {
    console.error("Challenge generation failed: stage=authentication; code=authentication-service-unavailable.");
    return NextResponse.json({ error: "Authentication could not be verified. Refresh the page and sign in again." }, { status: 503 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > appConfig.maxCaptureFileBytes + 50_000) return NextResponse.json({ error: "The request is too large." }, { status: 413 });
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    console.error("Challenge generation failed: stage=request-read; code=invalid-form-data.");
    return NextResponse.json({ error: "The challenge request could not be read. Refresh the page and retry." }, { status: 400 });
  }
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
  let pcn;
  try {
    pcn = await prisma.pcn.findUnique({ where: { id: pcnId }, include: { vehicle: true, issuer: true, invoiceEvidence: true } });
  } catch (error) {
    logDatabaseError("challenge.generate.load-pcn", error);
    const failure = classifyDatabaseError(error);
    return NextResponse.json({ error: failure.explanation }, { status: failure.kind === "unavailable" || failure.kind === "configuration" || failure.kind === "migrations" ? 503 : 500 });
  }
  if (!pcn) return NextResponse.json({ error: "The PCN could not be found." }, { status: 404 });

  const contraventionTime = extractContraventionTime(pcn.notes);
  const pcnDetails = {
    reference: pcn.reference,
    vehicleRegistration: pcn.vehicle.registrationDisplay,
    issuerName: pcn.issuer.name,
    issuerType: pcn.issuer.type,
    contraventionCode: pcn.contraventionCode,
    contraventionLocation: pcn.contraventionLocation,
    contraventionDate: pcn.contraventionDate.toISOString().slice(0, 10),
    contraventionTime,
    issueDate: pcn.issueDate.toISOString().slice(0, 10),
    noticeType: pcn.noticeType,
    caseNotes: pcn.notes,
  };
  const invoice = pcn.invoiceEvidence ? { reference: pcn.invoiceEvidence.reference, invoiceDate: pcn.invoiceEvidence.invoiceDate?.toISOString().slice(0, 10) ?? null, deliveryDate: pcn.invoiceEvidence.deliveryDate?.toISOString().slice(0, 10) ?? null, deliveryAddress: pcn.invoiceEvidence.deliveryAddress, billingAddress: pcn.invoiceEvidence.billingAddress, recipient: pcn.invoiceEvidence.recipient, supplier: pcn.invoiceEvidence.supplier, description: pcn.invoiceEvidence.description, deliveryTime: pcn.invoiceEvidence.deliveryTime, deliveryTimeEnd: pcn.invoiceEvidence.deliveryTimeEnd, deliveryTimeKind: pcn.invoiceEvidence.deliveryTimeKind, otherFacts: pcn.invoiceEvidence.otherFacts } : null;
  const evidenceAnalysis = analyzeDeliveryEvidence({ pcnLocation: pcn.contraventionLocation, pcnTime: contraventionTime, deliveryAddress: pcn.invoiceEvidence?.deliveryAddress, deliveryTime: pcn.invoiceEvidence?.deliveryTime, deliveryTimeEnd: pcn.invoiceEvidence?.deliveryTimeEnd, deliveryTimeKind: pcn.invoiceEvidence?.deliveryTimeKind });
  const writingInput: ChallengeWritingInput = { stage, reason, evidenceOption, additionalCircumstances, pcn: pcnDetails, invoice, evidenceAnalysis };
  const content: Array<Record<string, string>> = [{ type: "input_text", text: buildChallengeWritingPrompt(writingInput) }];

  if (evidenceFile instanceof File) {
    const data = Buffer.from(await evidenceFile.arrayBuffer()).toString("base64");
    if (temporaryEvidenceTypes.has(evidenceFile.type)) {
      content.push(evidenceFile.type === "application/pdf"
        ? { type: "input_file", filename: evidenceFile.name || "evidence.pdf", file_data: `data:${evidenceFile.type};base64,${data}`, detail: "high" }
        : { type: "input_image", image_url: `data:${evidenceFile.type};base64,${data}`, detail: "high" });
    }
  }

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: appConfig.openAiModel, store: false, input: [{ role: "user", content }], text: { format: { type: "json_schema", name: "pcn_challenge", strict: true, schema: challengeGenerationSchema }, verbosity: "low" } }),
    });
  } catch {
    console.error("Challenge generation failed: stage=openai-request; code=network-error.");
    return NextResponse.json({ error: "The AI service could not be reached. You can write or paste a challenge manually." }, { status: 502 });
  }
  if (!response.ok) {
    console.error(`Challenge generation failed: stage=openai-response; code=upstream-http-error; upstreamStatus=${response.status}.`);
    return NextResponse.json({ error: "The AI service could not generate a challenge. You can write one manually." }, { status: 502 });
  }
  let payload: unknown;
  try { payload = await response.json(); }
  catch {
    console.error("Challenge generation failed: stage=openai-response; code=non-json-response.");
    return NextResponse.json({ error: "The AI service returned an invalid response. You can write or paste a challenge manually." }, { status: 502 });
  }
  let generation;
  try {
    generation = parseOpenAiChallengeResponse(payload);
  } catch (error) {
    const code = error instanceof ChallengeResponseError ? error.code : "unknown";
    console.error(`Challenge generation failed: stage=structured-output; code=${code}.`);
    return NextResponse.json({ error: "The AI response was incomplete. You can write a challenge manually." }, { status: 502 });
  }
  const quality = challengeQualityReport(generation, writingInput);
  if (quality.blockingIssues.length) {
    const issueCodes = quality.blockingIssues.map((issue) => issue.code).join(",");
    console.error(`Challenge generation failed: stage=quality-check; codes=${issueCodes}.`);
    return NextResponse.json({ error: "The generated draft did not pass the factual quality checks. Review the saved evidence or write the challenge manually." }, { status: 502 });
  }
  if (quality.advisoryCodes.length) console.info(`Challenge generation accepted: stage=quality-check; advisoryCodes=${quality.advisoryCodes.join(",")}.`);
  return NextResponse.json({ generation });
}

export async function POST(request: Request) {
  try {
    return await handlePost(request);
  } catch (error) {
    const errorType = error instanceof SyntaxError ? "syntax" : error instanceof TypeError ? "type" : "unknown";
    console.error(`Challenge generation failed: stage=route; code=unexpected-${errorType}.`);
    return NextResponse.json({ error: "Challenge generation is temporarily unavailable. You can write or paste a challenge manually." }, { status: 500 });
  }
}
