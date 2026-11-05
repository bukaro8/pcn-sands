export type ChallengeGeneration = {
  challengeText: string;
  evidence: {
    deliveryAddress: string | null;
    deliveryDate: string | null;
    companyOrRecipient: string | null;
    reference: string | null;
  };
  missingInformation: string[];
};

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function parseChallengeGeneration(value: unknown): ChallengeGeneration {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("The challenge response was not an object");
  const source = value as Record<string, unknown>;
  const evidence = source.evidence;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) throw new Error("The evidence response was invalid");
  const challengeText = optionalText(source.challengeText);
  if (!challengeText) throw new Error("The generated challenge was empty");
  const record = evidence as Record<string, unknown>;
  return {
    challengeText,
    evidence: {
      deliveryAddress: optionalText(record.deliveryAddress),
      deliveryDate: optionalText(record.deliveryDate),
      companyOrRecipient: optionalText(record.companyOrRecipient),
      reference: optionalText(record.reference),
    },
    missingInformation: Array.isArray(source.missingInformation) ? source.missingInformation.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()) : [],
  };
}

export const challengeGenerationSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    challengeText: { type: "string" },
    evidence: {
      type: "object",
      additionalProperties: false,
      properties: {
        deliveryAddress: { type: ["string", "null"] },
        deliveryDate: { type: ["string", "null"] },
        companyOrRecipient: { type: ["string", "null"] },
        reference: { type: ["string", "null"] },
      },
      required: ["deliveryAddress", "deliveryDate", "companyOrRecipient", "reference"],
    },
    missingInformation: { type: "array", items: { type: "string" } },
  },
  required: ["challengeText", "evidence", "missingInformation"],
} as const;
