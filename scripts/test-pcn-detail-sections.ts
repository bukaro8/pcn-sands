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

console.log("PCN detail progressive-disclosure defaults passed");
