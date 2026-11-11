import { readFileSync } from "node:fs";

import { pcnDetailDefaultSections } from "../src/lib/pcn-detail-sections";

function expectDefaults(
  input: Parameters<typeof pcnDetailDefaultSections>[0],
  expected: ReturnType<typeof pcnDetailDefaultSections>,
) {
  const actual = pcnDetailDefaultSections(input);
  if (actual.invoiceEvidence !== expected.invoiceEvidence || actual.challenge !== expected.challenge) {
    throw new Error(`Unexpected section defaults: ${JSON.stringify({ input, expected, actual })}`);
  }
}

expectDefaults(
  { hasInvoiceEvidence: false, challengeStatus: "AWAITING_CHALLENGE", draftCount: 0, submittedChallengeCount: 0 },
  { invoiceEvidence: true, challenge: true },
);
expectDefaults(
  { hasInvoiceEvidence: true, challengeStatus: "AWAITING_DECISION", draftCount: 0, submittedChallengeCount: 1 },
  { invoiceEvidence: false, challenge: false },
);
expectDefaults(
  { hasInvoiceEvidence: true, challengeStatus: "ACCEPTED", draftCount: 1, submittedChallengeCount: 1 },
  { invoiceEvidence: false, challenge: true },
);
expectDefaults(
  { hasInvoiceEvidence: true, challengeStatus: "REJECTED", draftCount: 0, submittedChallengeCount: 0 },
  { invoiceEvidence: false, challenge: true },
);
expectDefaults(
  { hasInvoiceEvidence: false, challengeStatus: "ACCEPTED", draftCount: 0, submittedChallengeCount: 2 },
  { invoiceEvidence: true, challenge: false },
);

const detailPage = readFileSync(new URL("../src/app/pcns/[id]/page.tsx", import.meta.url), "utf8");
const lifecycleStart = detailPage.indexOf("Lifecycle</CardTitle>");
const decisionControl = detailPage.indexOf("<ChallengeDecisionDialog", lifecycleStart);
const collapsibleSections = detailPage.indexOf("<PcnDetailSections");
if (lifecycleStart < 0 || decisionControl < lifecycleStart || decisionControl > collapsibleSections) {
  throw new Error("The decision control is not rendered in the Lifecycle summary card");
}
if (detailPage.slice(collapsibleSections).includes("<ChallengeDecisionDialog")) {
  throw new Error("Challenge History still contains a duplicate decision control");
}
if (!detailPage.includes("{statusLabel(lifecycleChallenge.outcome)} on {formatDate(lifecycleChallenge.decisionDate)}")) {
  throw new Error("The Lifecycle summary does not display the recorded decision and date");
}

console.log("PCN detail progressive-disclosure defaults and Lifecycle decision placement passed");
