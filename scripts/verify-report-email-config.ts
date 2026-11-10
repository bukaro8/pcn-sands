import { readFile } from "node:fs/promises";

import { getManagerEmail, isValidEmailAddress } from "../src/lib/config";

async function main() {
  const previous = process.env.MANAGER_EMAIL;
  try {
  if (!isValidEmailAddress("manager@example.test") || isValidEmailAddress("manager@example") || isValidEmailAddress("not-an-email")) throw new Error("Email validation rules failed");
  process.env.MANAGER_EMAIL = " manager@example.test ";
  if (getManagerEmail() !== "manager@example.test") throw new Error("MANAGER_EMAIL was not normalised");
  process.env.MANAGER_EMAIL = "invalid-manager";
  if (getManagerEmail()) throw new Error("Invalid MANAGER_EMAIL was accepted");
  delete process.env.MANAGER_EMAIL;
  if (getManagerEmail()) throw new Error("Missing MANAGER_EMAIL was accepted");

  const component = await readFile(new URL("../src/components/report-email-confirmation.tsx", import.meta.url), "utf8");
  for (const required of ["To", "From", "Subject", "Reporting period", "Attachment", "Cancel", "Confirm &amp; Send", "form action={manuallySendReport}"]) {
    if (!component.includes(required)) throw new Error(`Confirmation modal is missing ${required}`);
  }
    console.log("Manager email validation and explicit report-send confirmation verified");
  } finally {
    if (previous === undefined) delete process.env.MANAGER_EMAIL;
    else process.env.MANAGER_EMAIL = previous;
  }
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
