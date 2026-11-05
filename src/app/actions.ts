"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { challengeOutcomes, challengeStages, challengeStatuses, noticeTypes, paymentStatuses } from "@/lib/pcn";
import { getOrCreateVehicle } from "@/lib/vehicles";
import { createOrGetReport } from "@/lib/reporting";
import { sendReportEmail } from "@/lib/jobs";
import { requireAdmin } from "@/lib/require-admin";

function value(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function optionalValue(formData: FormData, name: string): string | null {
  const result = value(formData, name);
  return result || null;
}

function requiredDate(formData: FormData, name: string): Date {
  const raw = value(formData, name);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error(`${name} must be a valid date`);
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`${name} must be a valid date`);
  return date;
}

function optionalDate(formData: FormData, name: string): Date | null {
  return value(formData, name) ? requiredDate(formData, name) : null;
}

function enumValue<T extends readonly string[]>(formData: FormData, name: string, options: T): T[number] {
  const selected = value(formData, name);
  if (!options.includes(selected)) throw new Error(`${name} is invalid`);
  return selected as T[number];
}

function issuerNormalizedName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function actionError(path: string, error: unknown): never {
  const message = error instanceof Error ? error.message : "Unable to save the PCN";
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
}

async function resolveIssuer(formData: FormData): Promise<string> {
  const issuerId = value(formData, "issuerId");
  if (issuerId) {
    const issuer = await prisma.issuer.findUnique({ where: { id: issuerId }, select: { id: true } });
    if (!issuer) throw new Error("Selected issuer no longer exists");
    return issuer.id;
  }

  const name = value(formData, "newIssuerName");
  if (!name) throw new Error("Select an issuer or enter a new issuer name");
  if (name.length > 160) throw new Error("Issuer name is too long");
  const type = value(formData, "newIssuerType") === "PRIVATE" ? "PRIVATE" : "COUNCIL";
  const challengeUrl = optionalValue(formData, "newIssuerChallengeUrl");

  if (challengeUrl) {
    try {
      new URL(challengeUrl);
    } catch {
      throw new Error("Issuer challenge URL must be valid");
    }
  }

  const issuer = await prisma.issuer.upsert({
    where: { normalizedName: issuerNormalizedName(name) },
    create: { name, normalizedName: issuerNormalizedName(name), type, challengeUrl },
    update: {},
  });
  return issuer.id;
}

async function syncPaymentReminder(pcnId: string, deadline: Date | null, paymentStatus: string) {
  if (!deadline || paymentStatus === "NOT_REQUIRED" || paymentStatus === "PAID") {
    await prisma.reminder.updateMany({ where: { pcnId, type: "PAYMENT_DEADLINE", status: "PENDING" }, data: { status: "COMPLETED", completedAt: new Date() } });
    return;
  }
  const dueAt = new Date(deadline);
  dueAt.setUTCDate(dueAt.getUTCDate() - 2);
  const deadlineKey = deadline.toISOString().slice(0, 10);
  await prisma.reminder.upsert({
    where: { eventKey: `payment-deadline:${pcnId}:${deadlineKey}` },
    create: {
      pcnId,
      type: "PAYMENT_DEADLINE",
      eventKey: `payment-deadline:${pcnId}:${deadlineKey}`,
      dueAt,
    },
    update: { dueAt },
  });
}

async function syncChallengeReminder(pcnId: string, challengeId: string, statusCheckDate: Date | null) {
  if (!statusCheckDate) return;
  const dateKey = statusCheckDate.toISOString().slice(0, 10);
  await prisma.reminder.upsert({
    where: { eventKey: `challenge-status-check:${challengeId}:${dateKey}` },
    create: { pcnId, challengeId, type: "CHALLENGE_STATUS_CHECK", eventKey: `challenge-status-check:${challengeId}:${dateKey}`, dueAt: statusCheckDate },
    update: { dueAt: statusCheckDate },
  });
}

function parsePcn(formData: FormData) {
  const reference = value(formData, "reference").toUpperCase();
  const registration = value(formData, "registration");
  const location = value(formData, "contraventionLocation");
  if (!reference || !registration || !location) throw new Error("Reference, vehicle registration and location are required");
  if (reference.length > 80 || location.length > 300) throw new Error("One or more fields are too long");

  return {
    reference,
    registration,
    contraventionCode: optionalValue(formData, "contraventionCode"),
    contraventionLocation: location,
    contraventionDate: requiredDate(formData, "contraventionDate"),
    issueDate: requiredDate(formData, "issueDate"),
    noticeType: enumValue(formData, "noticeType", noticeTypes),
    challengeStatus: enumValue(formData, "challengeStatus", challengeStatuses),
    paymentStatus: enumValue(formData, "paymentStatus", paymentStatuses),
    paymentDeadline: optionalDate(formData, "paymentDeadline"),
    paymentReference: optionalValue(formData, "paymentReference"),
    notes: optionalValue(formData, "notes"),
  };
}

export async function createPcn(formData: FormData) {
  await requireAdmin();
  let destination: string;
  try {
    const input = parsePcn(formData);
    const existing = await prisma.pcn.findUnique({ where: { reference: input.reference }, select: { id: true } });
    if (existing) throw new Error("A PCN with this reference already exists");
    const [vehicle, issuerId] = await Promise.all([getOrCreateVehicle(input.registration), resolveIssuer(formData)]);
    const pcn = await prisma.pcn.create({ data: { ...input, vehicleId: vehicle.id, issuerId } });
    await syncPaymentReminder(pcn.id, input.paymentDeadline, input.paymentStatus);
    destination = `/pcns/${pcn.id}`;
  } catch (error) {
    actionError("/pcns/new", error);
  }
  revalidatePath("/");
  revalidatePath("/pcns");
  redirect(destination!);
}

export async function updatePcn(formData: FormData) {
  await requireAdmin();
  const pcnId = value(formData, "pcnId");
  const detailPath = `/pcns/${pcnId}`;
  try {
    if (!pcnId) throw new Error("PCN is required");
    const input = parsePcn(formData);
    const existing = await prisma.pcn.findUnique({ where: { reference: input.reference }, select: { id: true } });
    if (existing && existing.id !== pcnId) throw new Error("A PCN with this reference already exists");
    const [vehicle, issuerId] = await Promise.all([getOrCreateVehicle(input.registration), resolveIssuer(formData)]);
    await prisma.pcn.update({ where: { id: pcnId }, data: { ...input, vehicleId: vehicle.id, issuerId } });
    await syncPaymentReminder(pcnId, input.paymentDeadline, input.paymentStatus);
  } catch (error) {
    actionError(detailPath, error);
  }
  revalidatePath("/");
  revalidatePath("/pcns");
  revalidatePath(detailPath);
  redirect(detailPath);
}

export async function createChallenge(formData: FormData) {
  await requireAdmin();
  const pcnId = value(formData, "pcnId");
  const detailPath = `/pcns/${pcnId}`;
  try {
    if (!pcnId) throw new Error("PCN is required");
    const nextStatusCheckDate = optionalDate(formData, "nextStatusCheckDate");
    const stage = enumValue(formData, "stage", challengeStages);
    const submissionDate = requiredDate(formData, "submissionDate");
    const duplicate = await prisma.challenge.findFirst({ where: { pcnId, stage, submissionDate } });
    if (duplicate) throw new Error("A challenge for this stage and submission date already exists");
    const challenge = await prisma.challenge.create({
      data: {
        pcnId,
        stage,
        submissionDate,
        expectedResponseDate: optionalDate(formData, "expectedResponseDate"),
        nextStatusCheckDate,
        challengeText: optionalValue(formData, "challengeText"),
      },
    });
    await prisma.pcn.update({ where: { id: pcnId }, data: { challengeStatus: "AWAITING_DECISION" } });
    await syncChallengeReminder(pcnId, challenge.id, nextStatusCheckDate);
  } catch (error) {
    actionError(detailPath, error);
  }
  revalidatePath("/");
  revalidatePath("/pcns");
  revalidatePath(detailPath);
  redirect(detailPath);
}

export async function saveChallengeDraft(formData: FormData) {
  await requireAdmin();
  const pcnId = value(formData, "pcnId");
  const detailPath = `/pcns/${pcnId}`;
  try {
    if (!pcnId) throw new Error("PCN is required");
    const challengeText = value(formData, "challengeText");
    if (!challengeText) throw new Error("Write or generate challenge text before saving a draft");
    if (challengeText.length > 12000) throw new Error("Challenge text is too long");
    const stage = enumValue(formData, "stage", challengeStages);
    const challengeId = value(formData, "challengeId");
    const data = { stage, challengeText, expectedResponseDate: optionalDate(formData, "expectedResponseDate"), nextStatusCheckDate: optionalDate(formData, "nextStatusCheckDate") };
    if (challengeId) {
      const existing = await prisma.challenge.findUnique({ where: { id: challengeId }, select: { pcnId: true, submissionDate: true } });
      if (!existing || existing.pcnId !== pcnId || existing.submissionDate) throw new Error("Only an unsent draft can be updated");
      await prisma.challenge.update({ where: { id: challengeId }, data });
    } else {
      await prisma.challenge.create({ data: { pcnId, ...data } });
    }
  } catch (error) {
    actionError(detailPath, error);
  }
  revalidatePath(detailPath);
  redirect(detailPath);
}

export async function markChallengeSubmitted(formData: FormData) {
  await requireAdmin();
  const pcnId = value(formData, "pcnId");
  const challengeId = value(formData, "challengeId");
  const detailPath = `/pcns/${pcnId}`;
  try {
    if (!pcnId || !challengeId) throw new Error("Challenge is required");
    const submissionDate = requiredDate(formData, "submissionDate");
    const challenge = await prisma.challenge.findUnique({ where: { id: challengeId }, select: { pcnId: true, submissionDate: true, stage: true } });
    if (!challenge || challenge.pcnId !== pcnId) throw new Error("Challenge does not belong to this PCN");
    if (challenge.submissionDate) throw new Error("This challenge has already been marked as submitted");
    const duplicate = await prisma.challenge.findFirst({ where: { pcnId, stage: challenge.stage, submissionDate } });
    if (duplicate) throw new Error("A challenge for this stage and submission date already exists");
    const nextStatusCheckDate = optionalDate(formData, "nextStatusCheckDate");
    const challengeText = value(formData, "challengeText");
    if (!challengeText) throw new Error("Challenge text is required before submission");
    if (challengeText.length > 12000) throw new Error("Challenge text is too long");
    await prisma.challenge.update({ where: { id: challengeId }, data: { submissionDate, outcome: "PENDING", nextStatusCheckDate, challengeText } });
    await prisma.pcn.update({ where: { id: pcnId }, data: { challengeStatus: "AWAITING_DECISION" } });
    await syncChallengeReminder(pcnId, challengeId, nextStatusCheckDate);
  } catch (error) {
    actionError(detailPath, error);
  }
  revalidatePath("/");
  revalidatePath("/pcns");
  revalidatePath(detailPath);
  redirect(detailPath);
}

export async function updateChallenge(formData: FormData) {
  await requireAdmin();
  const pcnId = value(formData, "pcnId");
  const challengeId = value(formData, "challengeId");
  const detailPath = `/pcns/${pcnId}`;
  try {
    if (!pcnId || !challengeId) throw new Error("Challenge is required");
    const outcome = enumValue(formData, "outcome", challengeOutcomes);
    const decisionDate = optionalDate(formData, "decisionDate");
    if (outcome !== "PENDING" && !decisionDate) throw new Error("A decision date is required for an accepted or rejected challenge");
    const existing = await prisma.challenge.findUnique({ where: { id: challengeId }, select: { pcnId: true } });
    if (!existing || existing.pcnId !== pcnId) throw new Error("Challenge does not belong to this PCN");
    await prisma.challenge.update({
      where: { id: challengeId },
      data: { outcome, decisionDate, nextStatusCheckDate: optionalDate(formData, "nextStatusCheckDate") },
    });
    await prisma.pcn.update({
      where: { id: pcnId },
      data: { challengeStatus: outcome === "PENDING" ? "AWAITING_DECISION" : outcome },
    });
  } catch (error) {
    actionError(detailPath, error);
  }
  revalidatePath("/");
  revalidatePath("/pcns");
  revalidatePath(detailPath);
  redirect(detailPath);
}

export async function deletePcn(formData: FormData) {
  await requireAdmin();
  const pcnId = value(formData, "pcnId");
  try {
    const reportCount = await prisma.reportEntry.count({ where: { pcnId } });
    if (reportCount) throw new Error("This PCN is included in report history and cannot be deleted");
    await prisma.pcn.delete({ where: { id: pcnId } });
  } catch (error) {
    actionError(`/pcns/${pcnId}`, error);
  }
  revalidatePath("/");
  revalidatePath("/pcns");
  redirect("/pcns?message=PCN%20deleted");
}

export async function generateReport(formData: FormData) {
  await requireAdmin();
  const type = value(formData, "type");
  if (type !== "WEEKLY" && type !== "MONTHLY") redirect("/reports?error=Invalid%20report%20type");
  let reportId: string;
  try {
    const report = await createOrGetReport(type);
    reportId = report.id;
  } catch {
    redirect("/reports?error=Unable%20to%20generate%20report");
  }
  revalidatePath("/reports");
  redirect(`/reports?generated=${reportId!}`);
}

export async function manuallySendReport(formData: FormData) {
  await requireAdmin();
  const reportId = value(formData, "reportId");
  try {
    const result = await sendReportEmail(reportId);
    if (!result.sent) redirect("/reports?error=This%20report%20was%20already%20accepted%20by%20the%20email%20provider");
  } catch {
    redirect("/reports?error=Report%20email%20was%20not%20accepted%20by%20the%20provider");
  }
  revalidatePath("/reports");
  redirect("/reports?sent=1");
}

export async function completeReminder(formData: FormData) {
  await requireAdmin();
  const reminderId = value(formData, "reminderId");
  const pcnId = value(formData, "pcnId");
  try {
    await prisma.reminder.update({ where: { id: reminderId }, data: { status: "COMPLETED", completedAt: new Date() } });
  } catch {
    redirect(`/pcns/${pcnId}?error=Unable%20to%20complete%20reminder`);
  }
  revalidatePath(`/pcns/${pcnId}`);
  redirect(`/pcns/${pcnId}`);
}
