import { parseExtractedPcn } from "../src/lib/pcn-extraction";

const mockedResponse = { reference: "AB12345678", registration: "AB12 CDE", issuerName: "Example Council", contraventionCode: null, contraventionLocation: "Example Street", contraventionDate: "2026-11-01", issueDate: "2026-11-03", noticeType: "NOTICE_TO_OWNER", paymentDeadline: null, amounts: ["£65.00"] };
const extraction = parseExtractedPcn(mockedResponse);
if (extraction.reference !== "AB12345678" || extraction.noticeType !== "NOTICE_TO_OWNER" || extraction.amounts[0] !== "£65.00") throw new Error("Mock extraction parsing failed");
const unavailable = parseExtractedPcn({ ...mockedResponse, reference: null, registration: null, issueDate: "not-a-date" });
if (unavailable.reference !== null || unavailable.registration !== null || unavailable.issueDate !== null) throw new Error("Missing data was not returned as null");
console.log("Mocked extraction parsing successful");
