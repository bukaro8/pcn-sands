import { noticeTypes } from "@/lib/pcn";

export type ExtractedPcn = {
  reference: string | null;
  registration: string | null;
  issuerName: string | null;
  contraventionCode: string | null;
  contraventionLocation: string | null;
  contraventionDate: string | null;
  issueDate: string | null;
  noticeType: (typeof noticeTypes)[number] | null;
  paymentDeadline: string | null;
  amounts: string[];
};

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function optionalString(value: unknown): string | null {
  if (value === null) return null;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalDate(value: unknown): string | null {
  const date = optionalString(value);
  return date && datePattern.test(date) && !Number.isNaN(new Date(`${date}T00:00:00.000Z`).getTime()) ? date : null;
}

export function parseExtractedPcn(value: unknown): ExtractedPcn {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("The extraction response was not an object");
  const record = value as Record<string, unknown>;
  const noticeType = optionalString(record.noticeType);
  const amounts = Array.isArray(record.amounts) ? record.amounts.filter((amount): amount is string => typeof amount === "string" && amount.trim().length > 0).map((amount) => amount.trim()) : [];

  if (noticeType && !noticeTypes.includes(noticeType as (typeof noticeTypes)[number])) {
    throw new Error("The extraction response contains an unsupported notice type");
  }

  return {
    reference: optionalString(record.reference),
    registration: optionalString(record.registration),
    issuerName: optionalString(record.issuerName),
    contraventionCode: optionalString(record.contraventionCode),
    contraventionLocation: optionalString(record.contraventionLocation),
    contraventionDate: optionalDate(record.contraventionDate),
    issueDate: optionalDate(record.issueDate),
    noticeType: noticeType as ExtractedPcn["noticeType"],
    paymentDeadline: optionalDate(record.paymentDeadline),
    amounts,
  };
}

export const extractionJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    reference: { type: ["string", "null"] },
    registration: { type: ["string", "null"] },
    issuerName: { type: ["string", "null"] },
    contraventionCode: { type: ["string", "null"] },
    contraventionLocation: { type: ["string", "null"] },
    contraventionDate: { type: ["string", "null"] },
    issueDate: { type: ["string", "null"] },
    noticeType: { type: ["string", "null"], enum: [...noticeTypes, null] },
    paymentDeadline: { type: ["string", "null"] },
    amounts: { type: "array", items: { type: "string" } },
  },
  required: ["reference", "registration", "issuerName", "contraventionCode", "contraventionLocation", "contraventionDate", "issueDate", "noticeType", "paymentDeadline", "amounts"],
} as const;
