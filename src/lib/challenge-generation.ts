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

export function issuerChallengeDescription(type: string): string {
  if (type === "PRIVATE") return "private parking company";
  if (type === "TRANSPORT_AUTHORITY") return "transport authority";
  return "local council";
}

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
  if (/insufficient to (?:demonstrate|prove)|does not prove (?:that )?the vehicle was loading|cannot establish (?:loading|delivery)/i.test(challengeText)) throw new Error("The generated challenge included private evidence concerns");
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

export function extractResponseOutputText(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (typeof source.output_text === "string" && source.output_text.trim()) return source.output_text;
  if (!Array.isArray(source.output)) return null;
  const text = source.output.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) return [];
    return content.flatMap((part) => {
      if (!part || typeof part !== "object" || Array.isArray(part)) return [];
      const record = part as Record<string, unknown>;
      return record.type === "output_text" && typeof record.text === "string" ? [record.text] : [];
    });
  }).join("");
  return text.trim() ? text : null;
}

export async function readChallengeGenerationResponse(response: Response): Promise<ChallengeGeneration> {
  if (response.redirected && response.url) {
    try {
      if (new URL(response.url).pathname === "/login") throw new Error("Your session has expired. Sign in again, then retry.");
    } catch (error) {
      if (error instanceof Error && error.message.includes("session has expired")) throw error;
    }
  }
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    if (response.status === 401 || response.status === 403) throw new Error("Your session has expired. Sign in again, then retry.");
    if (response.status === 404) throw new Error("Challenge generation is unavailable in this deployment. Refresh the page after the application is redeployed.");
    if (response.status === 413) throw new Error("The challenge request is too large. Remove or compress the evidence file and retry.");
    throw new Error("Challenge generation is temporarily unavailable. You can write or paste a challenge manually.");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("The challenge service returned an invalid response. You can write or paste a challenge manually.");
  }
  const record = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  if (!response.ok) {
    const error = typeof record.error === "string" && record.error.trim() ? record.error : "Challenge generation failed. You can write or paste a challenge manually.";
    throw new Error(error);
  }
  if (!("generation" in record)) throw new Error("The challenge service returned an incomplete response. You can write or paste a challenge manually.");
  return parseChallengeGeneration(record.generation);
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
