import { calculateInclusiveDeadline, isDiscountExpired, parseInvoiceJson, parsePcnJson, pcnPrompt } from "../src/lib/chatgpt-import";

function assert(value: boolean, label: string) { if (!value) throw new Error(label); }

const discountedPcn = parsePcnJson(JSON.stringify({
  schemaVersion: "pcn-1",
  reference: "TEST-123",
  registration: "AB12 CDE",
  issuerName: "Fictional Council",
  issuerType: "COUNCIL",
  noticeType: "ORIGINAL_PCN",
  contraventionCode: "01",
  contraventionDescription: "Fictional restriction",
  contraventionLocation: "Example Street",
  contraventionDate: "2026-09-23",
  contraventionTime: "10:30",
  issueDate: "2026-09-23",
  paymentDeadline: "2026-10-06",
  penaltyAmount: "65.00",
  discountedAmount: "65.00",
  fullPenaltyAmount: "130.00",
  discountDeadline: null,
  fullPaymentDeadline: null,
  discountPeriodDays: 14,
  discountPeriodStartDate: "2026-09-23",
  notes: null,
}));
assert(!Object.keys(discountedPcn.errors).length, "Valid discounted PCN failed validation");
assert(discountedPcn.values.discountPeriodDays === "14", "Numeric discount period was not normalised to the internal format");
assert(discountedPcn.values.discountDeadline === "2026-10-06" && discountedPcn.calculatedFields.includes("discountDeadline"), "Inclusive discount deadline was not calculated");
assert(calculateInclusiveDeadline("2026-09-23", 14) === "2026-10-06", "Inclusive date example was calculated incorrectly");
assert(isDiscountExpired("2026-10-06", new Date("2026-10-07T11:00:00.000Z")), "Expired discount was not detected");
assert(!isDiscountExpired("2026-10-06", new Date("2026-10-06T11:00:00.000Z")), "Final discount day was treated as expired");

const legacyPcn = parsePcnJson(JSON.stringify({ schemaVersion: "pcn-1", reference: "LEGACY-1", registration: "AB12 CDE", penaltyAmount: "65.00", paymentDeadline: null }));
assert(!Object.keys(legacyPcn.errors).length && legacyPcn.values.penaltyAmount === "65.00", "Existing pcn-1 import compatibility failed");
const numericStringPeriod = parsePcnJson(JSON.stringify({ schemaVersion: "pcn-1", discountPeriodDays: "21" }));
assert(!Object.keys(numericStringPeriod.errors).length && numericStringPeriod.values.discountPeriodDays === "21", "Numeric-string discount period was not accepted and normalised");
const transportAuthority = parsePcnJson(JSON.stringify({ schemaVersion: "pcn-1", issuerName: "Transport for London", issuerType: "TRANSPORT_AUTHORITY" }));
assert(!Object.keys(transportAuthority.errors).length && transportAuthority.values.issuerType === "TRANSPORT_AUTHORITY", "Transport authority issuer type was rejected");
assert(Boolean(parsePcnJson("not json").errors.json), "Malformed JSON accepted");
assert(Boolean(parsePcnJson('{\\"schemaVersion\\":\\"pcn-1\\"').errors.json), "Escaped, incomplete JSON accepted");
assert(Boolean(parsePcnJson(JSON.stringify({ schemaVersion: "pcn-1", notes: "A&#x20;B" })).errors.json), "HTML-escaped JSON content accepted");
assert(Boolean(parsePcnJson('{"schemaVersion":"pcn-1","issueDate":"2026-02-30"}').errors.issueDate), "Invalid date accepted");
assert(Boolean(parsePcnJson('{"schemaVersion":"pcn-1","unexpected":"value"}').errors.unexpected), "Unknown field accepted");
assert(parsePcnJson(JSON.stringify({ schemaVersion: "pcn-1", discountPeriodDays: "14", discountPeriodStartDate: null, discountDeadline: null })).values.discountDeadline === null, "Deadline was invented without a start date");
assert(Boolean(parsePcnJson(JSON.stringify({ schemaVersion: "pcn-1", discountPeriodDays: "14", discountPeriodStartDate: "2026-09-23", discountDeadline: "2026-10-07" })).errors.discountDeadline), "Inconsistent inclusive deadline accepted");
assert(pcnPrompt.includes("exactly one valid JSON object") && pcnPrompt.includes("HTML entities") && pcnPrompt.includes("Copy button") && pcnPrompt.includes("Classify Transport for London as TRANSPORT_AUTHORITY"), "Reusable prompt is missing reliable-copy or issuer-classification instructions");

const invoice = parseInvoiceJson(JSON.stringify({ schemaVersion: "invoice-1", reference: "INV-123", invoiceDate: "2026-11-01", deliveryDate: null, billingAddress: "Billing Street", deliveryAddress: null, deliveryTime: null }));
assert(!Object.keys(invoice.errors).length && invoice.values.deliveryDate === null && invoice.values.deliveryAddress === null && invoice.values.billingAddress === "Billing Street", "Invoice dates or addresses were conflated");
assert(Boolean(parseInvoiceJson('{"schemaVersion":"invoice-1","deliveryTime":"noon"}').errors.deliveryTime), "Unverified time accepted");
const invoiceWindow = parseInvoiceJson(JSON.stringify({ schemaVersion: "invoice-1", deliveryTime: "11:00", deliveryTimeEnd: "11:30", deliveryTimeKind: "SCHEDULED_WINDOW" }));
assert(Object.keys(invoiceWindow.errors).length === 0 && invoiceWindow.values.deliveryTimeEnd === "11:30", "Delivery window import failed");
assert(Boolean(parseInvoiceJson(JSON.stringify({ schemaVersion: "invoice-1", deliveryTime: "11:30", deliveryTimeEnd: "11:00", deliveryTimeKind: "SCHEDULED_WINDOW" })).errors.deliveryTimeEnd), "Contradictory delivery window accepted");
console.log("Reliable ChatGPT PCN/invoice JSON and discounted deadline parsing passed");
