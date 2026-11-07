import type { ChallengeGeneration } from "@/lib/challenge-generation";
import type { DeliveryEvidenceAnalysis } from "@/lib/delivery-evidence";

export type ChallengeWritingInput = {
  stage: string;
  reason: string;
  evidenceOption: string;
  additionalCircumstances: string;
  pcn: {
    reference: string;
    vehicleRegistration: string;
    issuerName: string;
    issuerType: string;
    contraventionCode: string | null;
    contraventionLocation: string;
    contraventionDate: string;
    contraventionTime: string | null;
    issueDate: string;
    noticeType: string;
    caseNotes: string | null;
  };
  invoice: {
    reference: string | null;
    invoiceDate: string | null;
    deliveryDate: string | null;
    deliveryAddress: string | null;
    billingAddress: string | null;
    recipient: string | null;
    supplier: string | null;
    description: string | null;
    deliveryTime: string | null;
    deliveryTimeEnd: string | null;
    deliveryTimeKind: string | null;
    otherFacts: string | null;
  } | null;
  evidenceAnalysis: DeliveryEvidenceAnalysis;
};

const reasonLabels: Record<string, string> = {
  LOADING_UNLOADING: "loading or unloading connected with a delivery",
  PARKING_RESTRICTION_SIGNAGE: "the parking restriction or signage",
  OTHER_CIRCUMSTANCES: "the administrator's recorded circumstances",
};

export function buildChallengeWritingPrompt(input: ChallengeWritingInput): string {
  const issuerGuidance = input.pcn.issuerType === "TRANSPORT_AUTHORITY"
    ? "This may involve a transport-authority restriction such as a TfL red route. Do not claim that loading was permitted, exempt, or outside the restriction unless the saved facts expressly establish it."
    : input.pcn.issuerType === "PRIVATE"
      ? "Use private parking notice terminology and do not rely on statutory council-PCN procedures."
      : "Use council PCN terminology appropriate to the known notice and stage.";
  const evidenceGuidance = input.invoice
    ? "Use relevant reviewed invoice details naturally, especially its reference, delivery address, recipient and recorded timing. An invoice supports the account but is not conclusive proof of loading or an exemption."
    : "No reviewed invoice is available. Do not imply that an invoice or delivery document exists.";

  return `Act as an experienced UK parking appeals specialist. Draft a concise, natural and persuasive British English challenge for manual review and submission.

Writing requirements:
- Address the issuing authority courteously and write in confident prose, not a generic template.
- Identify PCN ${input.pcn.reference} and vehicle ${input.pcn.vehicleRegistration} accurately.
- Present the strongest truthful ground supported by the saved facts: ${reasonLabels[input.reason] ?? input.reason}.
- Explain the relevant chronology and evidence specifically, without unnecessary repetition or excessive legal jargon.
- Clearly request cancellation of the PCN.
- Do not use mechanical headings or internal labels such as "Grounds", "LOADING_UNLOADING", "Evidence review", "Analysis" or "Missing information" in challengeText.
- Never include technical commentary, confidence assessments, evidence weaknesses or questions for the administrator in challengeText.
- Put every material fact requiring confirmation in missingInformation instead of asserting it in the letter.
- Do not invent driver statements, loading activity, distance, geographical proximity, legal exemptions, legislation, signage, dates, times or evidence.
- Never describe a scheduled delivery window as a confirmed delivery time.
- Do not conceal contradictions. Omit a contradicted proposition from the letter and describe the issue privately in missingInformation.

Evidence instructions:
- A driver may stop on a nearby street, but different street names do not establish either proximity or separation.
- Postcode agreement is only a clue. State shared postcode information only when useful; never turn it into a verified distance or claim that locations are nearby unless the private analysis says VERIFIED_NEARBY.
- If the PCN observation time falls within a scheduled window, it is truthful to say the times are consistent; do not say this proves the delivery occurred.
- ${evidenceGuidance}
- ${issuerGuidance}

Challenge stage: ${input.stage}.
Evidence selection: ${input.evidenceOption}.
Administrator-supplied circumstances: ${input.additionalCircumstances || "None supplied"}.
Saved PCN facts: ${JSON.stringify(input.pcn)}.
Reviewed invoice facts: ${JSON.stringify(input.invoice)}.
Private evidence analysis (never quote its labels or concerns in challengeText): ${JSON.stringify(input.evidenceAnalysis)}.

Return the structured challenge. challengeText must contain only the finished appeal letter. evidence must echo only reviewed supporting facts actually used. missingInformation must contain concise private confirmation requests and contradictions, never prose intended for the authority.`;
}

export function buildChatGptChallengePrompt(input: {
  stage: string;
  reason: string;
  additionalCircumstances: string;
  facts: Record<string, unknown>;
}): string {
  return `Write a concise, persuasive UK parking challenge in natural British English for manual review. Work only from the reviewed facts below and the administrator's additional circumstances.

Write like an experienced parking appeals specialist: courteous, confident, specific and free of generic filler. Identify the PCN and vehicle accurately, explain the strongest truthful cancellation ground, use relevant invoice details naturally, and finish with a clear request to cancel the PCN. Do not use headings such as "Grounds", internal enum labels, evidence-review notes, technical commentary or excessive legal jargon.

Do not invent loading activity, driver statements, distances, proximity, exemptions, legislation, signage, dates, times or documents. A postcode match is only a clue. A scheduled delivery window is not a confirmed delivery time. For a TfL or other transport-authority notice, do not claim that loading was permitted on a red route unless the reviewed facts expressly establish it. If a material fact is unconfirmed or contradicted, omit it rather than weakening the letter or asserting it.

Return only the finished editable challenge letter, with no commentary before or after it.

Stage: ${input.stage}
Selected reason: ${reasonLabels[input.reason] ?? input.reason}
Administrator-supplied circumstances: ${input.additionalCircumstances || "None supplied"}
Reviewed case, invoice and private evidence analysis: ${JSON.stringify(input.facts)}`;
}

function normalized(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function compact(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function challengeQualityIssues(generation: ChallengeGeneration, input: ChallengeWritingInput): string[] {
  const issues: string[] = [];
  const text = generation.challengeText;
  const lower = text.toLowerCase();
  if (text.length < 180) issues.push("The draft is too brief to explain the case professionally.");
  if (text.length > 6000) issues.push("The draft is unnecessarily long.");
  if (!lower.includes(input.pcn.reference.toLowerCase())) issues.push("The saved PCN reference is missing.");
  if (!compact(text).includes(compact(input.pcn.vehicleRegistration))) issues.push("The saved vehicle registration is missing.");
  if (/^(?:grounds?|evidence review|analysis|missing information)\s*:/im.test(text) || /\b(?:LOADING_UNLOADING|PARKING_RESTRICTION_SIGNAGE|OTHER_CIRCUMSTANCES)\b/.test(text)) issues.push("The draft contains an internal or mechanical label.");
  if (/insufficient to (?:demonstrate|prove)|does not prove|cannot establish|evidence is weak|lack of evidence/i.test(text)) issues.push("The draft exposes private evidence weaknesses.");
  const legalClaim = text.match(/\b(?:Traffic Management Act|Road Traffic Regulation Act|Protection of Freedoms Act|statutory exemption|regulation \d+)/i)?.[0];
  if (legalClaim && !JSON.stringify(input).toLowerCase().includes(legalClaim.toLowerCase())) issues.push("The draft introduces an unsupported legal claim.");
  if (input.evidenceAnalysis.location.status !== "VERIFIED_NEARBY" && /\b(?:nearby|adjacent|a short distance|in close proximity|immediate vicinity)\b/i.test(text) && !/\b(?:nearby|adjacent|a short distance|in close proximity|immediate vicinity)\b/i.test(input.additionalCircumstances)) issues.push("The draft overstates geographical proximity.");
  if (input.evidenceAnalysis.time.status === "OUTSIDE_STATED_WINDOW" && /\b(?:within|during|consistent with)\b.{0,50}\b(?:window|delivery time)\b/i.test(text)) issues.push("The draft contradicts the recorded time comparison.");
  if (input.invoice?.deliveryTimeKind === "SCHEDULED_WINDOW" && /\b(?:delivery (?:occurred|took place|was completed)|confirmed delivery)\b/i.test(text) && !/deliver(?:y|ed).{0,80}(?:confirm|occurred|completed)/i.test(input.additionalCircumstances)) issues.push("The draft treats a scheduled window as confirmed delivery.");
  if (input.evidenceOption === "DELIVERY_INVOICE" && input.invoice?.reference && !compact(text).includes(compact(input.invoice.reference))) issues.push("The reviewed invoice reference is missing.");
  if (generation.evidence.reference && input.invoice?.reference && normalized(generation.evidence.reference) !== normalized(input.invoice.reference)) issues.push("The generated invoice reference does not match the reviewed evidence.");
  if (generation.evidence.deliveryAddress && input.invoice?.deliveryAddress && normalized(generation.evidence.deliveryAddress) !== normalized(input.invoice.deliveryAddress)) issues.push("The generated delivery address does not match the reviewed evidence.");
  if (generation.evidence.deliveryDate && input.invoice?.deliveryDate && generation.evidence.deliveryDate !== input.invoice.deliveryDate) issues.push("The generated delivery date does not match the reviewed evidence.");
  return [...new Set(issues)];
}
