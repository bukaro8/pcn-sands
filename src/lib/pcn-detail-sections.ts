export function pcnDetailDefaultSections(input: {
  hasInvoiceEvidence: boolean;
  challengeStatus: string;
  draftCount: number;
  submittedChallengeCount: number;
}) {
  return {
    invoiceEvidence: !input.hasInvoiceEvidence,
    challenge: input.challengeStatus === "AWAITING_CHALLENGE"
      || input.draftCount > 0
      || input.submittedChallengeCount === 0,
  };
}
