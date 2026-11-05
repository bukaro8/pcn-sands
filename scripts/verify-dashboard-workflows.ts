import "dotenv/config";

import { prisma } from "../src/lib/prisma";
import { getOrCreateVehicle } from "../src/lib/vehicles";

async function main() {
  const suffix = `dashboard-${Date.now()}`;
  const issuer = await prisma.issuer.create({ data: { name: `Dashboard Council ${suffix}`, normalizedName: `dashboard council ${suffix}`, type: "COUNCIL" } });
  const vehicle = await getOrCreateVehicle(`D${Date.now()}`);
  let pcnId: string | undefined;

  try {
    const pcn = await prisma.pcn.create({
      data: {
        reference: `DASH-${suffix}`,
        vehicleId: vehicle.id,
        issuerId: issuer.id,
        contraventionLocation: "Test Street",
        contraventionDate: new Date("2026-11-01T00:00:00.000Z"),
        issueDate: new Date("2026-11-02T00:00:00.000Z"),
        noticeType: "ORIGINAL_PCN",
      },
    });
    pcnId = pcn.id;
    const duplicate = await prisma.pcn.create({ data: {
      reference: pcn.reference,
      vehicleId: pcn.vehicleId,
      issuerId: pcn.issuerId,
      contraventionLocation: pcn.contraventionLocation,
      contraventionDate: pcn.contraventionDate,
      issueDate: pcn.issueDate,
      noticeType: pcn.noticeType,
    } }).then(() => false).catch((error: unknown) => {
      return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
    });
    if (!duplicate) throw new Error("Duplicate PCN protection failed");

    const challenge = await prisma.challenge.create({ data: { pcnId, stage: "INITIAL", submissionDate: new Date("2026-11-03T00:00:00.000Z") } });
    await prisma.challenge.update({ where: { id: challenge.id }, data: { outcome: "REJECTED", decisionDate: new Date("2026-11-10T00:00:00.000Z") } });
    await prisma.pcn.update({ where: { id: pcnId }, data: { challengeStatus: "REJECTED", paymentStatus: "PAYMENT_REQUIRED", paymentDeadline: new Date("2026-11-20T00:00:00.000Z") } });
    const checked = await prisma.pcn.findUniqueOrThrow({ where: { id: pcnId }, include: { challenges: true } });
    if (checked.challenges[0]?.outcome !== "REJECTED" || checked.paymentStatus !== "PAYMENT_REQUIRED") throw new Error("Challenge or payment workflow verification failed");
    console.log("PCN, challenge and payment workflow verification successful");
  } finally {
    if (pcnId) await prisma.pcn.delete({ where: { id: pcnId } });
    await prisma.vehicle.delete({ where: { id: vehicle.id } });
    await prisma.issuer.delete({ where: { id: issuer.id } });
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
