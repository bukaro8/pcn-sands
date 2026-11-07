import { parseExtractedPcn } from "../src/lib/pcn-extraction";

const mockedResponse = { reference: "AB12345678", registration: "AB12 CDE", issuerName: "Example Council", contraventionCode: null, contraventionLocation: "Example Street", contraventionDate: "2026-09-23", issueDate: "2026-09-23", noticeType: "NOTICE_TO_OWNER", paymentDeadline: null, discountedAmount: "65.00", fullPenaltyAmount: "130.00", discountDeadline: null, fullPaymentDeadline: null, discountPeriodDays: "14", discountPeriodStartDate: "2026-09-23", amounts: ["£65.00", "£130.00"] };
const extraction = parseExtractedPcn(mockedResponse);
if (extraction.reference !== "AB12345678" || extraction.noticeType !== "NOTICE_TO_OWNER" || extraction.discountedAmount !== "65.00" || extraction.fullPenaltyAmount !== "130.00" || extraction.discountDeadline !== "2026-10-06") throw new Error("Mock extraction or inclusive discount parsing failed");
const unavailable = parseExtractedPcn({ ...mockedResponse, reference: null, registration: null, issueDate: "not-a-date" });
if (unavailable.reference !== null || unavailable.registration !== null || unavailable.issueDate !== null) throw new Error("Missing data was not returned as null");
const uncertain = parseExtractedPcn({ ...mockedResponse, discountDeadline: null, discountPeriodDays: "14", discountPeriodStartDate: null });
if (uncertain.discountDeadline !== null || uncertain.discountPeriodDays !== null) throw new Error("Uncertain discount deadline was calculated");
let inconsistentRejected = false;
try { parseExtractedPcn({ ...mockedResponse, discountDeadline: "2026-10-07" }); } catch { inconsistentRejected = true; }
if (!inconsistentRejected) throw new Error("Inconsistent extracted discount deadline was accepted");
console.log("Mocked extraction parsing successful");
