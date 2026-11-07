import { noticeTypes } from "@/lib/pcn";

export const pcnPrompt = `Read the attached UK parking PCN photograph carefully and extract only information that is visible in the notice.

Return exactly one valid JSON object inside a single \`\`\`json code block. Use double-quoted property names and properly escaped JSON strings. Include every key listed below, even when its value is null. Do not include HTML entities, explanatory text, comments, or any text before or after the code block.

Use schemaVersion "pcn-1" and exactly these keys: schemaVersion, reference, registration, issuerName, issuerType, noticeType, contraventionCode, contraventionDescription, contraventionLocation, contraventionDate, contraventionTime, issueDate, paymentDeadline, penaltyAmount, discountedAmount, fullPenaltyAmount, discountDeadline, fullPaymentDeadline, discountPeriodDays, discountPeriodStartDate, notes.

Return this exact object shape with the verified values filled in: {"schemaVersion":"pcn-1","reference":null,"registration":null,"issuerName":null,"issuerType":null,"noticeType":null,"contraventionCode":null,"contraventionDescription":null,"contraventionLocation":null,"contraventionDate":null,"contraventionTime":null,"issueDate":null,"paymentDeadline":null,"penaltyAmount":null,"discountedAmount":null,"fullPenaltyAmount":null,"discountDeadline":null,"fullPaymentDeadline":null,"discountPeriodDays":null,"discountPeriodStartDate":null,"notes":null}

Use strings or null for every field except schemaVersion and discountPeriodDays. discountPeriodDays must be a JSON whole number or null. issuerType must be COUNCIL, PRIVATE, or null. noticeType must be ORIGINAL_PCN, NOTICE_TO_OWNER, PRIVATE_PARKING_NOTICE, OTHER, or null. Dates must be YYYY-MM-DD, time must be HH:mm in 24-hour format, and GBP amounts must be decimal text without a currency symbol.

penaltyAmount is the primary operational amount: use the discounted amount when a discounted payment offer is shown; otherwise use the full amount. paymentDeadline is the corresponding primary deadline. Put the discounted and full amounts separately in discountedAmount and fullPenaltyAmount. Distinguish discountDeadline from fullPaymentDeadline.

Never assume a 14-day period. If the notice explicitly states a discount period and an unambiguous date on which that period begins, put the number of inclusive calendar days in discountPeriodDays and that starting date in discountPeriodStartDate. Calculate discountDeadline by counting the starting date as day 1. For example, a 14-day period beginning on 2026-09-23 ends on 2026-10-06. If the service date, starting date, period length, or rule is uncertain, do not calculate a deadline; use null.

Distinguish the contravention date from the issue date. Use null for anything missing, ambiguous, or unreadable. Never invent information or infer a deadline from a customary rule.

Attach the PCN photograph, send this prompt, then use the code block's Copy button to copy only the JSON object into Sands PCN Management.`;

export const invoicePrompt = `Read the attached delivery invoice carefully. Return exactly one valid JSON object inside a single \`\`\`json code block, with no text or commentary before or after the code block. Use schemaVersion "invoice-1" and these keys: schemaVersion, reference, invoiceDate, deliveryDate, deliveryAddress, billingAddress, recipient, supplier, description, deliveryTime, otherFacts. Use strings or null for every field except schemaVersion. Dates must be YYYY-MM-DD, time HH:mm (24-hour). Distinguish invoice date from an explicitly recorded delivery date and billing address from delivery address. An invoice's creation does not prove delivery occurred. Use null for absent, ambiguous or unreadable facts. Never invent delivery activity, loading, times or events. Attach the invoice, send this prompt, then use the code block's Copy button to copy only the JSON object.`;

type Result = { values: Record<string, string | null>; errors: Record<string, string>; calculatedFields: string[] };
const pcnFields = ["reference", "registration", "issuerName", "issuerType", "noticeType", "contraventionCode", "contraventionDescription", "contraventionLocation", "contraventionDate", "contraventionTime", "issueDate", "paymentDeadline", "penaltyAmount", "discountedAmount", "fullPenaltyAmount", "discountDeadline", "fullPaymentDeadline", "discountPeriodDays", "discountPeriodStartDate", "notes"] as const;
const invoiceFields = ["reference", "invoiceDate", "deliveryDate", "deliveryAddress", "billingAddress", "recipient", "supplier", "description", "deliveryTime", "otherFacts"] as const;
const dateFields = new Set(["contraventionDate", "issueDate", "paymentDeadline", "discountDeadline", "fullPaymentDeadline", "discountPeriodStartDate", "invoiceDate", "deliveryDate"]);
const amountFields = ["penaltyAmount", "discountedAmount", "fullPenaltyAmount"] as const;
const htmlEntityPattern = /&(?:#\d+|#x[\da-f]+|[a-z][\da-z]+);/i;

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function calculateInclusiveDeadline(startDate: string, periodDays: string | number): string | null {
  const days = typeof periodDays === "number" ? periodDays : Number(periodDays);
  if (!isIsoDate(startDate) || !Number.isInteger(days) || days < 1 || days > 366) return null;
  const result = new Date(`${startDate}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days - 1);
  return result.toISOString().slice(0, 10);
}

export function isDiscountExpired(deadline: string | null | undefined, now = new Date()): boolean {
  if (!deadline || !isIsoDate(deadline)) return false;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return deadline < `${part("year")}-${part("month")}-${part("day")}`;
}

function parse(raw: string, version: string, fields: readonly string[]): Result {
  const errors: Record<string, string> = {}; const values: Record<string, string | null> = {}; const calculatedFields: string[] = [];
  if (raw.length > 20000) return { values, errors: { json: "JSON is too long." }, calculatedFields };
  if (htmlEntityPattern.test(raw)) return { values, errors: { json: "HTML-escaped content is not accepted. In ChatGPT, use Copy on the JSON response and paste it again." }, calculatedFields };
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return { values, errors: { json: "This is not valid JSON. Copy only one complete JSON object from ChatGPT, including its opening and closing braces, without Markdown fences." }, calculatedFields }; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { values, errors: { json: "Expected exactly one JSON object." }, calculatedFields };
  const record = parsed as Record<string, unknown>;
  if (record.schemaVersion !== version) errors.schemaVersion = `Expected ${version}.`;
  for (const key of Object.keys(record)) if (key !== "schemaVersion" && !fields.includes(key)) errors[key] = "Unknown field.";
  for (const key of fields) {
    const fieldValue = record[key];
    if (fieldValue === undefined || fieldValue === null || fieldValue === "") { values[key] = null; continue; }
    if (key === "discountPeriodDays" && typeof fieldValue === "number") { values[key] = String(fieldValue); continue; }
    if (typeof fieldValue !== "string" || fieldValue.length > 3000 || /[\u0000-\u0008\u000e-\u001f]/.test(fieldValue)) { errors[key] = "Use a plain text value or null."; continue; }
    const cleaned = fieldValue.trim(); values[key] = cleaned || null;
    if (dateFields.has(key) && !isIsoDate(cleaned)) errors[key] = "Use a real YYYY-MM-DD date or null.";
    if ((key === "contraventionTime" || key === "deliveryTime") && !/^([01]\d|2[0-3]):[0-5]\d$/.test(cleaned)) errors[key] = "Use HH:mm or null.";
  }
  return { values, errors, calculatedFields };
}

export function parsePcnJson(raw: string): Result {
  const result = parse(raw, "pcn-1", pcnFields); const v = result.values;
  if (v.issuerType && !["COUNCIL", "PRIVATE"].includes(v.issuerType)) result.errors.issuerType = "Choose COUNCIL or PRIVATE.";
  if (v.noticeType && !noticeTypes.includes(v.noticeType as typeof noticeTypes[number])) result.errors.noticeType = "Unknown notice type.";
  for (const key of amountFields) if (v[key] && !/^\d{1,7}(\.\d{1,2})?$/.test(v[key])) result.errors[key] = "Use a GBP amount such as 65.00.";
  if (v.discountPeriodDays && !/^\d{1,3}$/.test(v.discountPeriodDays)) result.errors.discountPeriodDays = "Use a whole number of inclusive days or null.";
  const calculated = v.discountPeriodStartDate && v.discountPeriodDays ? calculateInclusiveDeadline(v.discountPeriodStartDate, v.discountPeriodDays) : null;
  if (v.discountPeriodStartDate && v.discountPeriodDays && !calculated) result.errors.discountPeriodDays = "The stated discount period must be between 1 and 366 days.";
  if (calculated && v.discountDeadline && v.discountDeadline !== calculated) result.errors.discountDeadline = `The inclusive period ends on ${calculated}; review the extracted deadline.`;
  if (calculated && !v.discountDeadline) { v.discountDeadline = calculated; result.calculatedFields.push("discountDeadline"); }
  return result;
}

export function parseInvoiceJson(raw: string) { return parse(raw, "invoice-1", invoiceFields); }
