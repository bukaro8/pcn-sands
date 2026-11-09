import "dotenv/config";

import { prisma } from "../src/lib/prisma";
import { getOrCreateVehicle } from "../src/lib/vehicles";
import { validateAppealUrl } from "../src/lib/appeal-url";

async function main() {
  const suffix = `challenge-${Date.now()}`;
  const issuer = await prisma.issuer.create({ data: { name: `Challenge Council ${suffix}`, normalizedName: `challenge council ${suffix}`, type: "COUNCIL" } });
  const vehicle = await getOrCreateVehicle(`C${Date.now()}`);
  let pcnId: string | undefined;
  try {
    const pcn = await prisma.pcn.create({ data: { reference: `CHALLENGE-${suffix}`, vehicleId: vehicle.id, issuerId: issuer.id, contraventionLocation: "Test Street", contraventionDate: new Date("2026-11-01T00:00:00.000Z"), issueDate: new Date("2026-11-02T00:00:00.000Z"), noticeType: "ORIGINAL_PCN" } });
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
    await prisma.challenge.update({ where: { id: draft.id }, data: { submissionDate: date, outcome: "PENDING", nextStatusCheckDate: new Date("2026-11-17T00:00:00.000Z") } });
    await prisma.pcn.update({ where: { id: pcnId }, data: { challengeStatus: "AWAITING_DECISION" } });
    const duplicateBlocked = await prisma.challenge.create({ data: { pcnId, stage: "INITIAL", submissionDate: date, challengeText: "Duplicate" } }).then(() => false).catch((error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "P2002");
    if (!duplicateBlocked) throw new Error("Duplicate submitted challenge was allowed");
    const checked = await prisma.pcn.findUniqueOrThrow({ where: { id: pcnId }, include: { challenges: true } });
    if (checked.challengeStatus !== "AWAITING_DECISION" || checked.challenges.length !== 1 || checked.challenges[0]?.challengeText !== "Manual draft") throw new Error("Draft save or submission transition failed");
    console.log("Appeal link reuse/edit, draft preservation, submission transition and duplicate prevention successful");
  } finally {
    if (pcnId) await prisma.pcn.delete({ where: { id: pcnId } });
    await prisma.vehicle.delete({ where: { id: vehicle.id } });
    await prisma.issuer.delete({ where: { id: issuer.id } });
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
