import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/require-admin";
import { normalizeUkRegistration } from "@/lib/vehicles";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { reference?: string; registration?: string } | null;
  if (!body || typeof body.reference !== "string" || typeof body.registration !== "string" || body.reference.length > 80 || body.registration.length > 30) return NextResponse.json({ error: "Invalid reference or registration" }, { status: 400 });
  const pcn = await prisma.pcn.findUnique({ where: { reference: body.reference.trim().toUpperCase() }, include: { vehicle: true } });
  const vehicle = await prisma.vehicle.findUnique({ where: { registrationNormalized: normalizeUkRegistration(body.registration) } });
  return NextResponse.json({ existingPcnId: pcn?.id ?? null, sameVehicle: pcn ? pcn.vehicle.registrationNormalized === normalizeUkRegistration(body.registration) : null, existingVehicle: Boolean(vehicle) });
}
