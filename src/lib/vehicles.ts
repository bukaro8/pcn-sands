import { prisma } from "@/lib/prisma";

export function normalizeUkRegistration(registration: string): string {
  return registration.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export async function getOrCreateVehicle(registration: string) {
  const registrationNormalized = normalizeUkRegistration(registration);

  if (!registrationNormalized) {
    throw new Error("Vehicle registration must contain letters or numbers");
  }

  return prisma.vehicle.upsert({
    where: { registrationNormalized },
    create: {
      registrationNormalized,
      registrationDisplay: registration.trim(),
    },
    update: {},
  });
}
