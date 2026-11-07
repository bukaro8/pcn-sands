import { extractResponseOutputText, issuerChallengeDescription, parseChallengeGeneration, readChallengeGenerationResponse } from "../src/lib/challenge-generation";
import { validateTemporaryEvidence } from "../src/lib/temporary-upload";

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

const validEvidence = new File(["evidence"], "invoice.pdf", { type: "application/pdf" });
const invalidEvidence = new File(["evidence"], "invoice.exe", { type: "application/octet-stream" });
if (validateTemporaryEvidence(validEvidence) !== null || !validateTemporaryEvidence(invalidEvidence)) throw new Error("Evidence validation failed");
console.log("Mocked challenge generation and evidence validation successful");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Challenge generation regression failed");
  process.exitCode = 1;
});
