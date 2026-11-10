import "dotenv/config";

import { prisma } from "../src/lib/prisma";
import { getOrCreateVehicle } from "../src/lib/vehicles";
import { validateAppealUrl } from "../src/lib/appeal-url";
import { defaultStatusCheckDate, defaultStatusCheckDateValue } from "../src/lib/challenge-follow-up";

async function main() {
  const suffix = `challenge-${Date.now()}`;
  const issuer = await prisma.issuer.create({ data: { name: `Challenge Council ${suffix}`, normalizedName: `challenge council ${suffix}`, type: "COUNCIL" } });
  const vehicle = await getOrCreateVehicle(`C${Date.now()}`);
  let pcnId: string | undefined;
  try {
    const paymentDeadline = new Date("2026-12-10T00:00:00.000Z");
    const pcn = await prisma.pcn.create({ data: { reference: `CHALLENGE-${suffix}`, vehicleId: vehicle.id, issuerId: issuer.id, contraventionLocation: "Test Street", contraventionDate: new Date("2026-11-01T00:00:00.000Z"), issueDate: new Date("2026-11-02T00:00:00.000Z"), noticeType: "ORIGINAL_PCN", paymentStatus: "PAYMENT_REQUIRED", paymentDeadline, paymentAmountPence: 6500 } });
    pcnId = pcn.id;
    const draft = await prisma.challenge.create({ data: { pcnId, stage: "INITIAL", challengeText: "Manual draft" } });
    if (draft.submissionDate !== null) throw new Error("Draft was incorrectly submitted");

    const firstLink = validateAppealUrl("https://appeals.example.gov.uk/submit");
    if (!firstLink.ok) throw new Error("Safe appeal URL was rejected");
    await prisma.issuer.update({ where: { id: issuer.id }, data: { challengeUrl: firstLink.url } });
    const reusedLink = await prisma.issuer.findUniqueOrThrow({ where: { id: issuer.id }, select: { challengeUrl: true } });
    if (reusedLink.challengeUrl !== firstLink.url) throw new Error("Appeal URL was not retained for issuer reuse");

    const editedLink = validateAppealUrl("https://appeals.example.gov.uk/new-portal");
    if (!editedLink.ok) throw new Error("Edited appeal URL was rejected");
    await prisma.issuer.update({ where: { id: issuer.id }, data: { challengeUrl: editedLink.url } });
    const unchangedDraft = await prisma.challenge.findUniqueOrThrow({ where: { id: draft.id } });
    if (unchangedDraft.submissionDate !== null || unchangedDraft.challengeText !== "Manual draft") {
      throw new Error("Saving or opening an appeal URL changed the draft");
    }

    const date = new Date("2026-11-03T00:00:00.000Z");
    const defaultCheckDate = defaultStatusCheckDate(date);
    if (defaultStatusCheckDateValue("2026-12-25") !== "2027-01-08") throw new Error("Fourteen-day follow-up calculation failed across a year boundary");
    await prisma.challenge.update({ where: { id: draft.id }, data: { submissionDate: date, outcome: "PENDING", nextStatusCheckDate: defaultCheckDate } });
    const firstReminder = await prisma.reminder.create({ data: { pcnId, challengeId: draft.id, type: "CHALLENGE_STATUS_CHECK", dueAt: defaultCheckDate, eventKey: `CHALLENGE_STATUS_CHECK:${draft.id}:2026-11-17` } });
    const editedCheckDate = new Date("2026-11-20T00:00:00.000Z");
    await prisma.$transaction([
      prisma.challenge.update({ where: { id: draft.id }, data: { nextStatusCheckDate: editedCheckDate } }),
      prisma.reminder.update({ where: { id: firstReminder.id }, data: { status: "COMPLETED", completedAt: new Date("2026-11-04T00:00:00.000Z") } }),
      prisma.reminder.create({ data: { pcnId, challengeId: draft.id, type: "CHALLENGE_STATUS_CHECK", dueAt: editedCheckDate, eventKey: `CHALLENGE_STATUS_CHECK:${draft.id}:2026-11-20` } }),
    ]);
    await prisma.pcn.update({ where: { id: pcnId }, data: { challengeStatus: "AWAITING_DECISION" } });
    const duplicateBlocked = await prisma.challenge.create({ data: { pcnId, stage: "INITIAL", submissionDate: date, challengeText: "Duplicate" } }).then(() => false).catch((error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "P2002");
    if (!duplicateBlocked) throw new Error("Duplicate submitted challenge was allowed");
    const checked = await prisma.pcn.findUniqueOrThrow({ where: { id: pcnId }, include: { challenges: true, reminders: true } });
    if (checked.challengeStatus !== "AWAITING_DECISION" || checked.challenges.length !== 1 || checked.challenges[0]?.challengeText !== "Manual draft") throw new Error("Draft save or submission transition failed");
    if (checked.challenges[0]?.nextStatusCheckDate?.toISOString() !== editedCheckDate.toISOString()) throw new Error("Edited status-check date was not retained");
    if (checked.reminders.filter((reminder) => reminder.status === "PENDING").length !== 1 || checked.reminders.filter((reminder) => reminder.status === "COMPLETED").length !== 1) throw new Error("Editing a follow-up did not preserve reminder history");

    await prisma.$transaction([
      prisma.challenge.update({ where: { id: draft.id }, data: { outcome: "REJECTED", decisionDate: new Date("2026-11-21T00:00:00.000Z"), decisionNotes: "Fictional regression decision note" } }),
      prisma.pcn.update({ where: { id: pcnId }, data: { challengeStatus: "REJECTED" } }),
      prisma.reminder.updateMany({ where: { challengeId: draft.id, type: "CHALLENGE_STATUS_CHECK", status: { in: ["PENDING", "NOTIFIED"] } }, data: { status: "COMPLETED", completedAt: new Date("2026-11-21T00:00:00.000Z") } }),
    ]);
    const decided = await prisma.pcn.findUniqueOrThrow({ where: { id: pcnId }, include: { challenges: true } });
    if (decided.challengeStatus !== "REJECTED" || decided.challenges[0]?.decisionNotes !== "Fictional regression decision note") throw new Error("Decision recording failed");
    if (decided.paymentDeadline?.toISOString() !== paymentDeadline.toISOString() || decided.paymentAmountPence !== 6500) throw new Error("Recording a rejection changed existing payment terms");
    console.log("Appeal link reuse/edit, 14-day follow-up, manual rescheduling, reminder history, decision recording, payment preservation and duplicate prevention successful");
  } finally {
    if (pcnId) await prisma.pcn.delete({ where: { id: pcnId } });
    await prisma.vehicle.delete({ where: { id: vehicle.id } });
    await prisma.issuer.delete({ where: { id: issuer.id } });
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
