import { parseInvoiceJson, parsePcnJson } from "../src/lib/chatgpt-import";

function assert(value: boolean, label: string) { if (!value) throw new Error(label); }
const pcn = parsePcnJson(JSON.stringify({ schemaVersion: "pcn-1", reference: "TEST-123", registration: "AB12 CDE", issuerName: "Fictional Council", issuerType: "COUNCIL", noticeType: "ORIGINAL_PCN", contraventionDate: "2026-11-03", issueDate: "2026-11-04", paymentDeadline: null }));
assert(!Object.keys(pcn.errors).length && pcn.values.paymentDeadline === null, "Valid PCN or missing deadline failed");
assert(Boolean(parsePcnJson("not json").errors.json), "Malformed JSON accepted");
assert(Boolean(parsePcnJson('{"schemaVersion":"pcn-1","issueDate":"2026-02-30"}').errors.issueDate), "Invalid date accepted");
assert(Boolean(parsePcnJson('{"schemaVersion":"pcn-1","unexpected":"value"}').errors.unexpected), "Unknown field accepted");
const invoice = parseInvoiceJson(JSON.stringify({ schemaVersion: "invoice-1", reference: "INV-123", invoiceDate: "2026-11-01", deliveryDate: null, billingAddress: "Billing Street", deliveryAddress: null, deliveryTime: null }));
assert(!Object.keys(invoice.errors).length && invoice.values.deliveryDate === null && invoice.values.deliveryAddress === null && invoice.values.billingAddress === "Billing Street", "Invoice dates or addresses were conflated");
assert(Boolean(parseInvoiceJson('{"schemaVersion":"invoice-1","deliveryTime":"noon"}').errors.deliveryTime), "Unverified time accepted");
console.log("ChatGPT PCN and invoice JSON parsing passed");
