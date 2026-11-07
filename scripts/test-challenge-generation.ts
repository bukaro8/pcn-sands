import { extractResponseOutputText, issuerChallengeDescription, parseChallengeGeneration, readChallengeGenerationResponse } from "../src/lib/challenge-generation";
import { validateTemporaryEvidence } from "../src/lib/temporary-upload";
import { analyzeDeliveryEvidence, extractContraventionTime } from "../src/lib/delivery-evidence";
import { buildChallengeWritingPrompt, buildChatGptChallengePrompt, challengeQualityIssues, type ChallengeWritingInput } from "../src/lib/challenge-writing";

async function main() {
const mockGeneration = {
  challengeText: "Dear Sir or Madam,\n\nPlease cancel this PCN. The vehicle was attending a delivery at the stated location. The attached evidence records the delivery date.\n\nYours faithfully",
  evidence: { deliveryAddress: "Example Street", deliveryDate: "2026-11-01", companyOrRecipient: "Example Recipient", reference: "INV-100" },
  missingInformation: ["No loading duration was supplied"],
};
const parsed = parseChallengeGeneration(mockGeneration);
if (!parsed.challengeText.includes("Please cancel") || parsed.evidence.reference !== "INV-100") throw new Error("Mock challenge response parsing failed");
let invalidResponseRejected = false;
try { parseChallengeGeneration({ challengeText: "", evidence: {}, missingInformation: [] }); } catch { invalidResponseRejected = true; }
if (!invalidResponseRejected) throw new Error("Invalid challenge response was accepted");
let selfDefeatingResponseRejected = false;
try { parseChallengeGeneration({ ...mockGeneration, challengeText: "These facts are insufficient to demonstrate that the vehicle was loading." }); } catch { selfDefeatingResponseRejected = true; }
if (!selfDefeatingResponseRejected) throw new Error("Self-defeating challenge text was accepted");
if (issuerChallengeDescription("COUNCIL") !== "local council" || issuerChallengeDescription("PRIVATE") !== "private parking company" || issuerChallengeDescription("TRANSPORT_AUTHORITY") !== "transport authority") throw new Error("Issuer-specific challenge terminology failed");

const rawResponsesPayload = { output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(mockGeneration) }] }] };
if (extractResponseOutputText(rawResponsesPayload) !== JSON.stringify(mockGeneration)) throw new Error("Raw Responses API output parsing failed");
const apiResult = await readChallengeGenerationResponse(new Response(JSON.stringify({ generation: mockGeneration }), { status: 200, headers: { "Content-Type": "application/json" } }));
if (apiResult.evidence.reference !== "INV-100") throw new Error("Challenge API response parsing failed");
let htmlFailureHandled = false;
try {
  await readChallengeGenerationResponse(new Response("<!DOCTYPE html><title>Server error</title>", { status: 500, headers: { "Content-Type": "text/html" } }));
} catch (error) {
  htmlFailureHandled = error instanceof Error && error.message.includes("temporarily unavailable") && !error.message.includes("Unexpected token");
}
if (!htmlFailureHandled) throw new Error("HTML challenge API failure was not converted to a useful message");
const loginRedirect = new Response("<!DOCTYPE html><title>Login</title>", { status: 200, headers: { "Content-Type": "text/html" } });
Object.defineProperties(loginRedirect, { redirected: { value: true }, url: { value: "https://pcn.example.test/login" } });
let loginRedirectHandled = false;
try {
  await readChallengeGenerationResponse(loginRedirect);
} catch (error) {
  loginRedirectHandled = error instanceof Error && error.message.includes("session has expired");
}
if (!loginRedirectHandled) throw new Error("Challenge API login redirect was not reported as an expired session");
let authFailureHandled = false;
try {
  await readChallengeGenerationResponse(new Response(JSON.stringify({ error: "Your session has expired. Sign in again, then retry." }), { status: 401, headers: { "Content-Type": "application/json" } }));
} catch (error) {
  authFailureHandled = error instanceof Error && error.message.includes("session has expired");
}
if (!authFailureHandled) throw new Error("Challenge API authentication failure was not preserved");

const nearbyWindow = analyzeDeliveryEvidence({
  pcnLocation: "Trevelyan Road, SW17",
  deliveryAddress: "201–203 Tooting High Street, SW17 0SZ",
  pcnTime: "11:24",
  deliveryTime: "11:00",
  deliveryTimeEnd: "11:30",
  deliveryTimeKind: "SCHEDULED_WINDOW",
});
if (nearbyWindow.location.status !== "POSSIBLE_MATCH" || nearbyWindow.time.status !== "WITHIN_STATED_WINDOW" || !nearbyWindow.missingFacts.some((fact) => fact.includes("scheduled delivery window"))) throw new Error("Nearby scheduled-window evidence was overstated or missed");
const unrelated = analyzeDeliveryEvidence({ pcnLocation: "Trevelyan Road, SW17", deliveryAddress: "1 Example Street, Manchester M1 1AA", pcnTime: "11:24", deliveryTime: "11:00", deliveryTimeEnd: "11:30", deliveryTimeKind: "SCHEDULED_WINDOW" });
if (unrelated.location.status !== "UNVERIFIED") throw new Error("Unrelated locations were treated as nearby");
const contradictory = analyzeDeliveryEvidence({ pcnLocation: "Trevelyan Road, SW17", deliveryAddress: "201–203 Tooting High Street, SW17 0SZ", pcnTime: "12:15", deliveryTime: "11:00", deliveryTimeEnd: "11:30", deliveryTimeKind: "SCHEDULED_WINDOW" });
if (contradictory.time.status !== "OUTSIDE_STATED_WINDOW") throw new Error("Contradictory delivery times were not identified");
const exactAddress = analyzeDeliveryEvidence({ pcnLocation: "201-203 Tooting High Street, SW17 0SZ", deliveryAddress: "201–203 Tooting High Street SW17 0SZ", pcnTime: null, deliveryTime: null, deliveryTimeEnd: null, deliveryTimeKind: null });
if (exactAddress.location.status !== "VERIFIED_NEARBY") throw new Error("Matching reviewed addresses were not recognised");
if (extractContraventionTime("Contravention description: example\nContravention time: 11:24") !== "11:24") throw new Error("Stored PCN time was not recovered");

const writingInput: ChallengeWritingInput = {
  stage: "INITIAL",
  reason: "LOADING_UNLOADING",
  evidenceOption: "DELIVERY_INVOICE",
  additionalCircumstances: "",
  pcn: {
    reference: "TF12345678",
    vehicleRegistration: "AB12 CDE",
    issuerName: "Transport for London",
    issuerType: "TRANSPORT_AUTHORITY",
    contraventionCode: "46",
    contraventionLocation: "Trevelyan Road, SW17",
    contraventionDate: "2026-11-02",
    contraventionTime: "11:24",
    issueDate: "2026-11-03",
    noticeType: "ORIGINAL_PCN",
    caseNotes: "Red route restriction shown on the notice.",
  },
  invoice: {
    reference: "INV-100",
    invoiceDate: "2026-11-02",
    deliveryDate: "2026-11-02",
    deliveryAddress: "201–203 Tooting High Street, SW17 0SZ",
    billingAddress: null,
    recipient: "Example Foods Ltd",
    supplier: "Example Deliveries Ltd",
    description: "Food delivery",
    deliveryTime: "11:00",
    deliveryTimeEnd: "11:30",
    deliveryTimeKind: "SCHEDULED_WINDOW",
    otherFacts: null,
  },
  evidenceAnalysis: nearbyWindow,
};
const professionalLetter = `Dear Sir or Madam,

I am writing to challenge PCN TF12345678 issued to vehicle AB12 CDE in Trevelyan Road on 2 November 2026.

Invoice INV-100, dated 2 November 2026, records a scheduled delivery for Example Foods Ltd at 201–203 Tooting High Street, SW17 0SZ, with a stated window of 11:00 to 11:30. The PCN records the vehicle in Trevelyan Road at 11:24, which falls within that documented window. The PCN location and delivery address are both recorded in the SW17 postcode district, and the invoice is supplied as evidence of the delivery-related circumstances.

Please consider the enclosed delivery evidence and cancel the PCN.

Yours faithfully`;
const professionalGeneration = { ...mockGeneration, challengeText: professionalLetter, evidence: { deliveryAddress: writingInput.invoice!.deliveryAddress, deliveryDate: writingInput.invoice!.deliveryDate, companyOrRecipient: writingInput.invoice!.recipient, reference: writingInput.invoice!.reference }, missingInformation: nearbyWindow.missingFacts };
if (challengeQualityIssues(professionalGeneration, writingInput).length) throw new Error(`Professional delivery challenge failed quality checks: ${challengeQualityIssues(professionalGeneration, writingInput).join("; ")}`);
const apiPrompt = buildChallengeWritingPrompt(writingInput);
if (!apiPrompt.includes("experienced UK parking appeals specialist") || !apiPrompt.includes("primary evidential basis") || !apiPrompt.includes("TfL red route") || !apiPrompt.includes("scheduled delivery window as a confirmed delivery time") || !apiPrompt.includes("TF12345678") || apiPrompt.includes("Administrator-supplied additional circumstances")) throw new Error("Professional API writing brief is incomplete");
const fallback = buildChatGptChallengePrompt({ stage: writingInput.stage, reason: writingInput.reason, additionalCircumstances: writingInput.additionalCircumstances, facts: { ...writingInput.pcn, invoice: writingInput.invoice, evidenceAnalysis: writingInput.evidenceAnalysis } });
if (!fallback.includes("primary basis") || !fallback.includes("Return only the finished editable challenge letter") || !fallback.includes("TF12345678") || !fallback.includes("scheduled delivery window is not confirmed delivery activity") || fallback.includes("Explicit administrator-supplied additional circumstances")) throw new Error("ChatGPT fallback did not preserve the writing safeguards");
const explicitCircumstances = "The administrator confirmed that access restrictions required the vehicle to stop on the recorded street.";
if (!buildChallengeWritingPrompt({ ...writingInput, additionalCircumstances: explicitCircumstances }).includes(explicitCircumstances) || !buildChatGptChallengePrompt({ stage: writingInput.stage, reason: writingInput.reason, additionalCircumstances: explicitCircumstances, facts: {} }).includes(explicitCircumstances)) throw new Error("Explicit additional circumstances were omitted");
for (const [label, challengeText] of [
  ["internal heading", professionalLetter.replace("Dear Sir or Madam,", "Grounds: Loading / unloading")],
  ["invented proximity", professionalLetter.replace("both recorded in the SW17 postcode district", "in close proximity")],
  ["unsupported law", professionalLetter.replace("Please consider", "Under the Traffic Management Act, you must cancel this PCN. Please consider")],
  ["scheduled time overstated", professionalLetter.replace("falls within that documented window", "confirms delivery took place")],
  ["driver testimony", professionalLetter.replace("Invoice INV-100", "The driver confirms the delivery. Invoice INV-100")],
] as const) {
  if (!challengeQualityIssues({ ...professionalGeneration, challengeText }, writingInput).length) throw new Error(`Quality checks accepted ${label}`);
}
const contradictoryInput = { ...writingInput, pcn: { ...writingInput.pcn, contraventionTime: "12:15" }, evidenceAnalysis: contradictory };
if (!challengeQualityIssues(professionalGeneration, contradictoryInput).some((issue) => issue.includes("time comparison"))) throw new Error("Contradictory time claim passed quality checks");
if (!challengeQualityIssues({ ...professionalGeneration, challengeText: professionalLetter.replace("TF12345678", "TF00000000") }, writingInput).some((issue) => issue.includes("PCN reference"))) throw new Error("Incorrect PCN reference passed quality checks");
if (!challengeQualityIssues({ ...professionalGeneration, evidence: { ...professionalGeneration.evidence, reference: "INV-999" } }, writingInput).some((issue) => issue.includes("invoice reference"))) throw new Error("Incorrect invoice reference passed quality checks");
if (!challengeQualityIssues({ ...professionalGeneration, evidence: { ...professionalGeneration.evidence, deliveryDate: "2026-11-03" } }, writingInput).some((issue) => issue.includes("delivery date"))) throw new Error("Incorrect delivery date passed quality checks");
if (!challengeQualityIssues({ ...professionalGeneration, evidence: { ...professionalGeneration.evidence, deliveryAddress: "1 Unrelated Street" } }, writingInput).some((issue) => issue.includes("delivery address"))) throw new Error("Incorrect delivery address passed quality checks");
if (!unrelated.location.detail.includes("differ") || !unrelated.location.detail.includes("does not automatically make the invoice irrelevant")) throw new Error("Different postcode districts did not produce a private non-rejection warning");
const unrelatedWritingInput: ChallengeWritingInput = { ...writingInput, invoice: { ...writingInput.invoice!, deliveryAddress: "1 Example Street, Manchester M1 1AA" }, evidenceAnalysis: unrelated };
const unrelatedLetter = professionalLetter.replace("201–203 Tooting High Street, SW17 0SZ", "1 Example Street, Manchester M1 1AA").replace("The PCN location and delivery address are both recorded in the SW17 postcode district, and the invoice is supplied as evidence of the delivery-related circumstances.", "The invoice is supplied as evidence of the recorded delivery-related circumstances.");
const unrelatedGeneration = { ...professionalGeneration, challengeText: unrelatedLetter, evidence: { ...professionalGeneration.evidence, deliveryAddress: unrelatedWritingInput.invoice!.deliveryAddress } };
if (challengeQualityIssues(unrelatedGeneration, unrelatedWritingInput).length) throw new Error("A postcode-district warning automatically rejected otherwise consistent invoice evidence");
const missingPostcode = analyzeDeliveryEvidence({ pcnLocation: "Trevelyan Road", deliveryAddress: "201–203 Tooting High Street", pcnTime: "11:24", deliveryTime: "11:00", deliveryTimeEnd: "11:30", deliveryTimeKind: "SCHEDULED_WINDOW" });
if (!missingPostcode.location.detail.includes("could not be established") || !missingPostcode.location.detail.includes("invoice remains available")) throw new Error("Missing postcode district did not produce a private warning");
const noInvoicePrompt = buildChallengeWritingPrompt({ ...writingInput, evidenceOption: "NO_ADDITIONAL_EVIDENCE", invoice: null });
if (!noInvoicePrompt.includes("Do not imply that an invoice or delivery document exists")) throw new Error("No-invoice case could invent delivery evidence");

const validEvidence = new File(["evidence"], "invoice.pdf", { type: "application/pdf" });
const invalidEvidence = new File(["evidence"], "invoice.exe", { type: "application/octet-stream" });
if (validateTemporaryEvidence(validEvidence) !== null || !validateTemporaryEvidence(invalidEvidence)) throw new Error("Evidence validation failed");
console.log("Mocked challenge generation and evidence validation successful");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Challenge generation regression failed");
  process.exitCode = 1;
});
