import { parseChallengeGeneration } from "../src/lib/challenge-generation";
import { validateTemporaryEvidence } from "../src/lib/temporary-upload";

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

const validEvidence = new File(["evidence"], "invoice.pdf", { type: "application/pdf" });
const invalidEvidence = new File(["evidence"], "invoice.exe", { type: "application/octet-stream" });
if (validateTemporaryEvidence(validEvidence) !== null || !validateTemporaryEvidence(invalidEvidence)) throw new Error("Evidence validation failed");
console.log("Mocked challenge generation and evidence validation successful");
