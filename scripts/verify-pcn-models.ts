import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { getOrCreateVehicle } from "../src/lib/vehicles";

async function main() {
  const suffix = `verification-${Date.now()}`;
  const registration = `v${Date.now()}`;
  const issuer = await prisma.issuer.create({
    data: {
      name: `Verification Council ${suffix}`,
      normalizedName: `verification council ${suffix}`,
      type: "COUNCIL",
    },
  });

  let vehicleId: string | undefined;
  let pcnId: string | undefined;
  let reportId: string | undefined;

  try {
    const firstVehicle = await getOrCreateVehicle(registration.toLowerCase());
    const secondVehicle = await getOrCreateVehicle(registration.toUpperCase());

    if (
      firstVehicle.id !== secondVehicle.id ||
      firstVehicle.registrationNormalized !== registration.toUpperCase()
    ) {
      throw new Error("Vehicle registration normalisation or deduplication failed");
    }

    vehicleId = firstVehicle.id;

    const pcn = await prisma.pcn.create({
      data: {
        reference: `VERIFY-${suffix}`,
        vehicleId,
        issuerId: issuer.id,
        contraventionLocation: "Verification Street",
        contraventionDate: new Date("2026-11-01T00:00:00.000Z"),
        issueDate: new Date("2026-11-02T00:00:00.000Z"),
        noticeType: "NOTICE_TO_OWNER",
        challengeStatus: "AWAITING_DECISION",
        paymentStatus: "PAYMENT_REQUIRED",
        paymentDeadline: new Date("2026-11-16T00:00:00.000Z"),
        challenges: {
          create: {
            stage: "FORMAL",
            submissionDate: new Date("2026-11-03T00:00:00.000Z"),
            expectedResponseDate: new Date("2026-11-30T00:00:00.000Z"),
          },
        },
      },
      include: { challenges: true },
    });

    pcnId = pcn.id;
    const challenge = pcn.challenges[0];

    const report = await prisma.reportHistory.create({
      data: {
        type: "WEEKLY",
        periodStart: new Date("2026-11-02T00:00:00.000Z"),
        periodEnd: new Date("2026-11-08T00:00:00.000Z"),
        entries: {
          create: {
            pcnId,
            challengeStatus: pcn.challengeStatus,
            paymentStatus: pcn.paymentStatus,
            paymentDeadline: pcn.paymentDeadline,
            paymentNoticeNumber: 1,
          },
        },
      },
      include: { entries: true },
    });

    reportId = report.id;

    await prisma.reminder.create({
      data: {
        pcnId,
        challengeId: challenge.id,
        type: "CHALLENGE_STATUS_CHECK",
        eventKey: `challenge-status-check:${challenge.id}:2026-11-30`,
        dueAt: new Date("2026-11-30T09:00:00.000Z"),
      },
    });

    const verified = await prisma.pcn.findUniqueOrThrow({
      where: { id: pcnId },
      include: { vehicle: true, issuer: true, challenges: true, reportEntries: true, reminders: true },
    });

    if (
      verified.vehicle.id !== vehicleId ||
      verified.issuer.id !== issuer.id ||
      verified.challenges.length !== 1 ||
      verified.reportEntries[0]?.paymentNoticeNumber !== 1 ||
      verified.reminders.length !== 1
    ) {
      throw new Error("PCN model relationships failed verification");
    }

    console.log("PCN model verification successful");
  } finally {
    if (reportId) {
      await prisma.reportHistory.delete({ where: { id: reportId } });
    }
    if (pcnId) {
      await prisma.pcn.delete({ where: { id: pcnId } });
    }
    if (vehicleId) {
      await prisma.vehicle.delete({ where: { id: vehicleId } });
    }
    await prisma.issuer.delete({ where: { id: issuer.id } });
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("PCN model verification failed");
  if (error instanceof Error) {
    console.error(error.message);
  }
  process.exitCode = 1;
});
