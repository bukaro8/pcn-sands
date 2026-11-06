import { noticeTypes } from "@/lib/pcn";

export const pcnPrompt = `Read the attached PCN photograph carefully. Return exactly one JSON object, with no Markdown or commentary. Use schemaVersion "pcn-1" and these keys: schemaVersion, reference, registration, issuerName, issuerType (COUNCIL or PRIVATE), noticeType (ORIGINAL_PCN, NOTICE_TO_OWNER, PRIVATE_PARKING_NOTICE or OTHER), contraventionCode, contraventionDescription, contraventionLocation, contraventionDate, contraventionTime, issueDate, paymentDeadline, penaltyAmount, notes. Use strings or null for every field except schemaVersion. Dates must be YYYY-MM-DD, time HH:mm (24-hour), amount GBP decimal without a currency symbol. Distinguish the contravention date from notice issue date. Use null for anything missing, ambiguous or unreadable. Never invent details or infer a payment deadline. Attach the PCN photograph before sending this prompt.`;
export const invoicePrompt = `Read the attached delivery invoice carefully. Return exactly one JSON object, with no Markdown or commentary. Use schemaVersion "invoice-1" and these keys: schemaVersion, reference, invoiceDate, deliveryDate, deliveryAddress, billingAddress, recipient, supplier, description, deliveryTime, otherFacts. Use strings or null for every field except schemaVersion. Dates must be YYYY-MM-DD, time HH:mm (24-hour). Distinguish invoice date from an explicitly recorded delivery date and billing address from delivery address. An invoice's creation does not prove delivery occurred. Use null for absent, ambiguous or unreadable facts. Never invent delivery activity, loading, times or events. Attach the invoice before sending this prompt.`;

type Result = { values: Record<string, string | null>; errors: Record<string, string> };
const pcnFields = ["reference", "registration", "issuerName", "issuerType", "noticeType", "contraventionCode", "contraventionDescription", "contraventionLocation", "contraventionDate", "contraventionTime", "issueDate", "paymentDeadline", "penaltyAmount", "notes"] as const;
const invoiceFields = ["reference", "invoiceDate", "deliveryDate", "deliveryAddress", "billingAddress", "recipient", "supplier", "description", "deliveryTime", "otherFacts"] as const;
const dateFields = new Set(["contraventionDate", "issueDate", "paymentDeadline", "invoiceDate", "deliveryDate"]);
function parse(raw: string, version: string, fields: readonly string[]): Result {
  const errors: Record<string, string> = {}; const values: Record<string, string | null> = {};
  if (raw.length > 20000) return { values, errors: { json: "JSON is too long." } };
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return { values, errors: { json: "Paste one valid JSON object without Markdown fences." } }; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { values, errors: { json: "Expected a JSON object." } };
  const record = parsed as Record<string, unknown>;
  if (record.schemaVersion !== version) errors.schemaVersion = `Expected ${version}.`;
  for (const key of Object.keys(record)) if (key !== "schemaVersion" && !fields.includes(key)) errors[key] = "Unknown field.";
  for (const key of fields) {
    const value = record[key];
    if (value === undefined || value === null || value === "") { values[key] = null; continue; }
    if (typeof value !== "string" || value.length > 3000 || /[\u0000-\u0008\u000e-\u001f]/.test(value)) { errors[key] = "Use a plain text value or null."; continue; }
    const cleaned = value.trim(); values[key] = cleaned || null;
    if (dateFields.has(key) && (!/^\d{4}-\d{2}-\d{2}$/.test(cleaned) || Number.isNaN(new Date(`${cleaned}T00:00:00Z`).getTime()) || new Date(`${cleaned}T00:00:00Z`).toISOString().slice(0, 10) !== cleaned)) errors[key] = "Use a real YYYY-MM-DD date or null.";
    if ((key === "contraventionTime" || key === "deliveryTime") && !/^([01]\d|2[0-3]):[0-5]\d$/.test(cleaned)) errors[key] = "Use HH:mm or null.";
  }
  return { values, errors };
}
export function parsePcnJson(raw: string) {
  const result = parse(raw, "pcn-1", pcnFields); const v = result.values;
  if (v.issuerType && !["COUNCIL", "PRIVATE"].includes(v.issuerType)) result.errors.issuerType = "Choose COUNCIL or PRIVATE.";
  if (v.noticeType && !noticeTypes.includes(v.noticeType as typeof noticeTypes[number])) result.errors.noticeType = "Unknown notice type.";
  if (v.penaltyAmount && !/^\d{1,7}(\.\d{1,2})?$/.test(v.penaltyAmount)) result.errors.penaltyAmount = "Use a GBP amount such as 65.00.";
  return result;
}
export function parseInvoiceJson(raw: string) { return parse(raw, "invoice-1", invoiceFields); }
