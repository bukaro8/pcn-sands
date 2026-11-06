import "dotenv/config";

import { getDailyChecklist, completeChecklistTask, isWeekdayMidday } from "../src/lib/checklist";
import { processDailyChecklistEmail } from "../src/lib/jobs";
import { prisma } from "../src/lib/prisma";

async function main() {
  const suffix = `checklist-${Date.now()}`;
  const now = new Date("2045-06-05T11:00:00.000Z");
  if (!isWeekdayMidday(now) || isWeekdayMidday(new Date("2045-06-04T10:00:00.000Z"))) throw new Error("Europe/London weekday midday detection failed");
  const issuer = await prisma.issuer.create({ data: { name: `Checklist Council ${suffix}`, normalizedName: `checklist council ${suffix}`, type: "COUNCIL" } });
  const vehicleIds: string[] = []; const pcnIds: string[] = []; const jobKeys = [`daily-checklist:2045-06-05`, `daily-checklist:2045-06-06`];
  const previous = { admin: process.env.ADMIN_EMAIL, auth: process.env.AUTH_URL, resend: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM, fetch: globalThis.fetch };
  process.env.ADMIN_EMAIL = "admin@example.test"; process.env.AUTH_URL = "https://pcn.vicstack.uk"; process.env.RESEND_API_KEY = "test_key"; process.env.EMAIL_FROM = "Sands PCN Management <test@example.com>";
  const sent: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => { sent.push(JSON.parse(String(init?.body)) as Record<string, unknown>); return new Response(JSON.stringify({ id: `checklist-email-${sent.length}` }), { status: 200 }); }) as typeof fetch;
  try {
    async function createCase(index: number, status: "AWAITING_CHALLENGE" | "AWAITING_DECISION" | "ACCEPTED", withReminder = false) {
      const vehicle = await prisma.vehicle.create({ data: { registrationNormalized: `CK${index}${suffix}`.replace(/[^A-Z0-9]/g, ""), registrationDisplay: `CK${index} TEST` } }); vehicleIds.push(vehicle.id);
      const pcn = await prisma.pcn.create({ data: { reference: `CHECK-${index}-${suffix}`, vehicleId: vehicle.id, issuerId: issuer.id, contraventionLocation: "Checklist Street", contraventionDate: new Date("2045-06-03T00:00:00.000Z"), issueDate: new Date("2045-06-03T00:00:00.000Z"), noticeType: "ORIGINAL_PCN", challengeStatus: status } }); pcnIds.push(pcn.id);
      if (status === "ACCEPTED") await prisma.challenge.create({ data: { pcnId: pcn.id, stage: "INITIAL", submissionDate: new Date("2045-06-03T00:00:00.000Z"), outcome: "ACCEPTED", decisionDate: new Date("2045-06-04T00:00:00.000Z") } });
      if (withReminder) {
        const challenge = await prisma.challenge.create({ data: { pcnId: pcn.id, stage: "INITIAL", submissionDate: new Date("2045-06-01T00:00:00.000Z"), outcome: "PENDING" } });
        await prisma.reminder.create({ data: { pcnId: pcn.id, challengeId: challenge.id, type: "CHALLENGE_STATUS_CHECK", eventKey: `checklist:${suffix}`, dueAt: new Date("2045-06-04T00:00:00.000Z") } });
      }
      return pcn;
    }
    await createCase(1, "AWAITING_CHALLENGE");
    await createCase(2, "AWAITING_DECISION", true);
    await createCase(3, "ACCEPTED");
    const first = await getDailyChecklist(now);
    const second = await getDailyChecklist(now);
    if (first.length !== 3 || second.length !== 3 || new Set(first.map((task) => task.taskKey)).size !== 3) throw new Error("Checklist generation duplicated or missed actionable tasks");
    const statusTask = first.find((task) => task.type === "CHALLENGE_STATUS_CHECK");
    if (!statusTask) throw new Error("Status-check task was not generated");
    await completeChecklistTask(statusTask.id);
    const reminder = await prisma.reminder.findFirstOrThrow({ where: { pcnId: statusTask.pcnId, type: "CHALLENGE_STATUS_CHECK" } });
    const unchanged = await prisma.pcn.findUniqueOrThrow({ where: { id: statusTask.pcnId } });
    if (reminder.status !== "COMPLETED" || unchanged.challengeStatus !== "AWAITING_DECISION" || (await getDailyChecklist(now)).length !== 2) throw new Error("Checklist completion changed case state or did not persist");
    const sentResult = await processDailyChecklistEmail(now);
    if (sentResult.status !== "succeeded" || sent.length !== 1 || !String(sent[0]?.html).includes("https://pcn.vicstack.uk/pcns/")) throw new Error("Checklist email or case links failed");
    const duplicate = await processDailyChecklistEmail(new Date("2045-06-05T11:05:00.000Z"));
    if (duplicate.status !== "skipped" || sent.length !== 1) throw new Error("Checklist email duplicate protection failed");
    for (const task of await getDailyChecklist(now)) await completeChecklistTask(task.id);
    const empty = await processDailyChecklistEmail(new Date("2045-06-06T11:00:00.000Z"));
    if (empty.status !== "skipped" || empty.reason !== "no-actionable-tasks" || sent.length !== 1) throw new Error("Empty checklist sent an email");
    console.log("Daily checklist generation, completion, links, weekday scheduling and mocked email passed");
  } finally {
    await prisma.jobExecution.deleteMany({ where: { jobKey: { in: jobKeys } } });
    if (pcnIds.length) await prisma.pcn.deleteMany({ where: { id: { in: pcnIds } } });
    if (vehicleIds.length) await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
    await prisma.issuer.delete({ where: { id: issuer.id } });
    await prisma.$disconnect();
    process.env.ADMIN_EMAIL = previous.admin; process.env.AUTH_URL = previous.auth; process.env.RESEND_API_KEY = previous.resend; process.env.EMAIL_FROM = previous.from; globalThis.fetch = previous.fetch;
  }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
