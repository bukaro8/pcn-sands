"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { classifyDatabaseError, logDatabaseError } from "@/lib/database-errors";
import { challengeOutcomes, challengeStages, challengeStatuses, issuerTypes, noticeTypes, paymentStatuses } from "@/lib/pcn";
import { getOrCreateVehicle, normalizeUkRegistration } from "@/lib/vehicles";
import { createOrGetReport } from "@/lib/reporting";
import { sendReportEmail } from "@/lib/jobs";
import { completeChecklistTask } from "@/lib/checklist";
import { requireAdmin } from "@/lib/require-admin";
import { calculateInclusiveDeadline } from "@/lib/chatgpt-import";
import { buildPcnWriteData } from "@/lib/pcn-write";
import { validateAppealUrl } from "@/lib/appeal-url";
import { defaultStatusCheckDate } from "@/lib/challenge-follow-up";

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
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw) throw new Error(`${name} must be a valid date`);
  return date;
}

function optionalDate(formData: FormData, name: string): Date | null {
  return value(formData, name) ? requiredDate(formData, name) : null;
}

function optionalMoneyInPence(formData: FormData, name: string): number | null {
  const raw = value(formData, name);
  if (!raw) return null;
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(raw)) throw new Error("Payment amount must be a valid non-negative amount");
  return Math.round(Number(raw) * 100);
}

function optionalPositiveInteger(formData: FormData, name: string): number | null {
  const raw = value(formData, name);
  if (!raw) return null;
  if (!/^\d{1,3}$/.test(raw) || Number(raw) < 1 || Number(raw) > 366) throw new Error("Discount period must be between 1 and 366 days");
  return Number(raw);
}

function enumValue<T extends readonly string[]>(formData: FormData, name: string, options: T): T[number] {
  const selected = value(formData, name);
  if (!options.includes(selected)) throw new Error(`${name} is invalid`);
  return selected as T[number];
}

function issuerNormalizedName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function isTransportForLondon(normalizedName: string): boolean {
  return ["transport for london", "transport for london (tfl)", "tfl"].includes(normalizedName);
}

function actionError(path: string, error: unknown, operation = "pcn.action"): never {
  const safeMessages = [
    "Selected issuer no longer exists", "Select an issuer or enter a new issuer name", "Issuer name is too long",
    "Issuer challenge URL must be valid", "Reference, vehicle registration and location are required",
    "One or more fields are too long", "A PCN with this reference already exists", "PCN is required",
    "A challenge for this stage and submission date already exists", "Write or generate challenge text before saving a draft",
    "Challenge text is too long", "Only an unsent draft can be updated", "Challenge is required",
    "Challenge does not belong to this PCN", "This challenge has already been marked as submitted",
    "Challenge text is required before submission", "A decision date is required for an accepted or rejected challenge",
    "This PCN is included in report history and cannot be deleted", "Payment amount must be a valid non-negative amount",
    "A rejected challenge must retain a payment status", "Notice does not match this PCN and vehicle",
    "Additional evidence details are too long",
    "Contravention time must use HH:mm", "Notes are too long", "Delivery time must use HH:mm",
    "Delivery time kind is invalid", "Delivery window end must be later than its start",
    "Discount period must be between 1 and 366 days",
    "Discount deadline does not match the stated inclusive period",
    "Only a pending submitted challenge can update its status-check date",
    "Select accepted or rejected before recording a decision", "Only a submitted challenge can have a decision",
  ];
  let message: string;
  if (error instanceof Error && (safeMessages.includes(error.message) || /^(contraventionDate|issueDate|paymentDeadline|discountDeadline|fullPaymentDeadline|discountPeriodStartDate|submissionDate|decisionDate|expectedResponseDate|nextStatusCheckDate) must be a valid date$/.test(error.message))) {
    message = error.message;
  } else {
    logDatabaseError(operation, error);
    message = classifyDatabaseError(error).explanation;
  }
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
  const normalizedName = issuerNormalizedName(name);
  const selectedType = value(formData, "newIssuerType");
  const type = isTransportForLondon(normalizedName)
    ? "TRANSPORT_AUTHORITY"
    : issuerTypes.includes(selectedType as typeof issuerTypes[number]) ? selectedType as typeof issuerTypes[number] : "COUNCIL";
  const challengeUrl = optionalValue(formData, "newIssuerChallengeUrl");

  if (challengeUrl) {
    try {
      new URL(challengeUrl);
    } catch {
      throw new Error("Issuer challenge URL must be valid");
    }
  }

  const issuer = await prisma.issuer.upsert({
    where: { normalizedName },
    create: { name, normalizedName, type, challengeUrl },
    update: isTransportForLondon(normalizedName) ? { type: "TRANSPORT_AUTHORITY" } : {},
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
  const eventKey = `payment-deadline:${pcnId}:${deadlineKey}`;
  await prisma.reminder.updateMany({
    where: { pcnId, type: "PAYMENT_DEADLINE", status: "PENDING", eventKey: { not: eventKey } },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
  await prisma.reminder.upsert({
    where: { eventKey },
    create: {
      pcnId,
      type: "PAYMENT_DEADLINE",
      eventKey,
      dueAt,
    },
    update: { dueAt },
  });
}

async function resolvePreparationChecklistTask(pcnId: string) {
  await prisma.checklistTask.updateMany({
    where: { taskKey: `prepare-challenge:${pcnId}`, completedAt: null },
    data: { completedAt: new Date() },
  });
}

async function resolveChallengeStatusChecks(challengeId: string) {
  await prisma.reminder.updateMany({
    where: { challengeId, type: "CHALLENGE_STATUS_CHECK", status: { in: ["PENDING", "NOTIFIED"] } },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
}

async function syncChallengeReminder(pcnId: string, challengeId: string, statusCheckDate: Date | null) {
  if (!statusCheckDate) {
    await resolveChallengeStatusChecks(challengeId);
    return;
  }
  const dateKey = statusCheckDate.toISOString().slice(0, 10);
  const eventKey = `challenge-status-check:${challengeId}:${dateKey}`;
  await prisma.$transaction([
    prisma.reminder.updateMany({
      where: { challengeId, type: "CHALLENGE_STATUS_CHECK", status: { in: ["PENDING", "NOTIFIED"] }, eventKey: { not: eventKey } },
      data: { status: "COMPLETED", completedAt: new Date() },
    }),
    prisma.reminder.upsert({
      where: { eventKey },
      create: { pcnId, challengeId, type: "CHALLENGE_STATUS_CHECK", eventKey, dueAt: statusCheckDate },
      update: { dueAt: statusCheckDate },
    }),
  ]);
}

function parsePcn(formData: FormData) {
  const reference = value(formData, "reference").toUpperCase();
  const registration = value(formData, "registration");
  const location = value(formData, "contraventionLocation");
  if (!reference || !registration || !location) throw new Error("Reference, vehicle registration and location are required");
  if (reference.length > 80 || location.length > 300) throw new Error("One or more fields are too long");
  const description = optionalValue(formData, "contraventionDescription");
  const time = optionalValue(formData, "contraventionTime");
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Contravention time must use HH:mm");
  const notes = [description && `Contravention description: ${description}`, time && `Contravention time: ${time}`, optionalValue(formData, "notes")].filter(Boolean).join("\n") || null;
  if ((notes?.length ?? 0) > 4000) throw new Error("Notes are too long");
  const discountPeriodDays = optionalPositiveInteger(formData, "discountPeriodDays");
  const discountPeriodStartDate = optionalDate(formData, "discountPeriodStartDate");
  const statedDiscountDeadline = optionalDate(formData, "discountDeadline");
  const calculatedDiscountDeadline = discountPeriodDays && discountPeriodStartDate
    ? calculateInclusiveDeadline(discountPeriodStartDate.toISOString().slice(0, 10), discountPeriodDays)
    : null;
  if (statedDiscountDeadline && calculatedDiscountDeadline && statedDiscountDeadline.toISOString().slice(0, 10) !== calculatedDiscountDeadline) {
    throw new Error("Discount deadline does not match the stated inclusive period");
  }

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
    paymentAmountPence: optionalMoneyInPence(formData, "paymentAmount"),
    discountedAmountPence: optionalMoneyInPence(formData, "discountedAmount"),
    fullPenaltyAmountPence: optionalMoneyInPence(formData, "fullPenaltyAmount"),
    discountDeadline: statedDiscountDeadline ?? (calculatedDiscountDeadline ? new Date(`${calculatedDiscountDeadline}T00:00:00.000Z`) : null),
    fullPaymentDeadline: optionalDate(formData, "fullPaymentDeadline"),
    discountPeriodDays,
    discountPeriodStartDate,
    paymentReference: optionalValue(formData, "paymentReference"),
    notes,
  };
}

export async function createPcn(formData: FormData) {
  await requireAdmin();
  let destination: string;
  let operation = "pcn.create.parse";
  try {
    const input = parsePcn(formData);
    operation = "pcn.create.check-duplicate";
    const existing = await prisma.pcn.findUnique({ where: { reference: input.reference }, select: { id: true } });
    if (existing) throw new Error("A PCN with this reference already exists");
    operation = "pcn.create.resolve-vehicle";
    const vehicle = await getOrCreateVehicle(input.registration);
    operation = "pcn.create.resolve-issuer";
    const issuerId = await resolveIssuer(formData);
    operation = "pcn.create";
    const pcn = await prisma.pcn.create({ data: buildPcnWriteData(input, vehicle.id, issuerId) });
    operation = "pcn.create.sync-payment-reminder";
    await syncPaymentReminder(pcn.id, input.paymentDeadline, input.paymentStatus);
    destination = `/pcns/${pcn.id}`;
  } catch (error) {
    actionError("/pcns/new", error, operation);
  }
  revalidatePath("/");
  revalidatePath("/pcns");
  redirect(destination!);
}

export async function completeChecklistTaskAction(formData: FormData) {
  await requireAdmin();
  const taskId = value(formData, "taskId");
  if (taskId) await completeChecklistTask(taskId);
  revalidatePath("/");
  redirect("/?completed=1");
}

export async function updatePcn(formData: FormData) {
  await requireAdmin();
  const pcnId = value(formData, "pcnId");
  const detailPath = `/pcns/${pcnId}`;
  let operation = "pcn.update.validate";
  try {
    if (!pcnId) throw new Error("PCN is required");
    const input = parsePcn(formData);
    operation = "pcn.update.check-duplicate";
    const existing = await prisma.pcn.findUnique({ where: { reference: input.reference }, select: { id: true } });
    if (existing && existing.id !== pcnId) throw new Error("A PCN with this reference already exists");
    operation = "pcn.update.resolve-vehicle";
    const vehicle = await getOrCreateVehicle(input.registration);
    operation = "pcn.update.resolve-issuer";
    const issuerId = await resolveIssuer(formData);
    operation = "pcn.update";
    await prisma.pcn.update({ where: { id: pcnId }, data: buildPcnWriteData(input, vehicle.id, issuerId) });
    operation = "pcn.update.sync-payment-reminder";
    await syncPaymentReminder(pcnId, input.paymentDeadline, input.paymentStatus);
  } catch (error) {
    actionError(detailPath, error, operation);
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
    const stage = enumValue(formData, "stage", challengeStages);
    const submissionDate = requiredDate(formData, "submissionDate");
    const nextStatusCheckDate = optionalDate(formData, "nextStatusCheckDate") ?? defaultStatusCheckDate(submissionDate);
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
    await resolvePreparationChecklistTask(pcnId);
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
    const nextStatusCheckDate = optionalDate(formData, "nextStatusCheckDate") ?? defaultStatusCheckDate(submissionDate);
    const challengeText = value(formData, "challengeText");
    if (!challengeText) throw new Error("Challenge text is required before submission");
    if (challengeText.length > 12000) throw new Error("Challenge text is too long");
    await prisma.challenge.update({ where: { id: challengeId }, data: { submissionDate, outcome: "PENDING", nextStatusCheckDate, challengeText } });
    await prisma.pcn.update({ where: { id: pcnId }, data: { challengeStatus: "AWAITING_DECISION" } });
    await resolvePreparationChecklistTask(pcnId);
    await syncChallengeReminder(pcnId, challengeId, nextStatusCheckDate);
  } catch (error) {
    actionError(detailPath, error);
  }
  revalidatePath("/");
  revalidatePath("/pcns");
  revalidatePath(detailPath);
  redirect(detailPath);
}

export async function saveIssuerChallengeUrl(input: { pcnId: string; issuerId: string; url: string }): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await requireAdmin();
  const pcnId = String(input?.pcnId ?? "").trim();
  const issuerId = String(input?.issuerId ?? "").trim();
  const validation = validateAppealUrl(String(input?.url ?? ""));
  if (!pcnId || !issuerId) return { ok: false, error: "The issuer could not be verified for this PCN." };
  if (!validation.ok) return validation;
  try {
    const linkedPcn = await prisma.pcn.findFirst({ where: { id: pcnId, issuerId }, select: { id: true } });
    if (!linkedPcn) return { ok: false, error: "The issuer could not be verified for this PCN." };
    await prisma.issuer.update({ where: { id: issuerId }, data: { challengeUrl: validation.url } });
  } catch (error) {
    logDatabaseError("issuer.appeal-url.update", error);
    return { ok: false, error: classifyDatabaseError(error).explanation };
  }
  revalidatePath(`/pcns/${pcnId}`);
  return { ok: true, url: validation.url };
}

export async function updateChallenge(formData: FormData) {
  await requireAdmin();
  const pcnId = value(formData, "pcnId");
  const challengeId = value(formData, "challengeId");
  const detailPath = `/pcns/${pcnId}`;
  try {
    if (!pcnId || !challengeId) throw new Error("Challenge is required");
    const outcome = enumValue(formData, "outcome", challengeOutcomes);
    if (outcome === "PENDING") throw new Error("Select accepted or rejected before recording a decision");
    const decisionDate = optionalDate(formData, "decisionDate");
    if (!decisionDate) throw new Error("A decision date is required for an accepted or rejected challenge");
    const decisionNotes = optionalValue(formData, "decisionNotes");
    if ((decisionNotes?.length ?? 0) > 4000) throw new Error("Notes are too long");
    const existing = await prisma.challenge.findUnique({ where: { id: challengeId }, select: { pcnId: true, submissionDate: true, pcn: { select: { paymentStatus: true, paymentDeadline: true, paymentAmountPence: true, paymentReference: true } } } });
    if (!existing || existing.pcnId !== pcnId) throw new Error("Challenge does not belong to this PCN");
    if (!existing.submissionDate) throw new Error("Only a submitted challenge can have a decision");
    await prisma.challenge.update({
      where: { id: challengeId },
      data: { outcome, decisionDate, decisionNotes },
    });
    if (outcome === "REJECTED") {
      const paymentStatus = enumValue(formData, "paymentStatus", paymentStatuses);
      if (paymentStatus === "NOT_REQUIRED") throw new Error("A rejected challenge must retain a payment status");
      const paymentDeadline = optionalDate(formData, "paymentDeadline") ?? existing.pcn.paymentDeadline;
      const paymentAmountPence = optionalMoneyInPence(formData, "paymentAmount") ?? existing.pcn.paymentAmountPence;
      const paymentReference = optionalValue(formData, "paymentReference") ?? existing.pcn.paymentReference;
      await prisma.pcn.update({ where: { id: pcnId }, data: {
        challengeStatus: "REJECTED",
        paymentStatus,
        paymentDeadline,
        paymentAmountPence,
        paymentReference,
      } });
      await syncPaymentReminder(pcnId, paymentDeadline, paymentStatus);
    } else {
      await prisma.pcn.update({ where: { id: pcnId }, data: { challengeStatus: outcome } });
    }
    await resolveChallengeStatusChecks(challengeId);
  } catch (error) {
    actionError(detailPath, error);
  }
  revalidatePath("/");
  revalidatePath("/pcns");
  revalidatePath(detailPath);
  redirect(detailPath);
}

export async function updateChallengeStatusCheck(formData: FormData) {
  await requireAdmin();
  const pcnId = value(formData, "pcnId");
  const challengeId = value(formData, "challengeId");
  const detailPath = `/pcns/${pcnId}`;
  try {
    if (!pcnId || !challengeId) throw new Error("Challenge is required");
    const challenge = await prisma.challenge.findUnique({ where: { id: challengeId }, select: { pcnId: true, submissionDate: true, outcome: true } });
    if (!challenge || challenge.pcnId !== pcnId) throw new Error("Challenge does not belong to this PCN");
    if (!challenge.submissionDate || challenge.outcome !== "PENDING") throw new Error("Only a pending submitted challenge can update its status-check date");
    const nextStatusCheckDate = optionalDate(formData, "nextStatusCheckDate");
    await prisma.challenge.update({ where: { id: challengeId }, data: { nextStatusCheckDate } });
    await syncChallengeReminder(pcnId, challengeId, nextStatusCheckDate);
  } catch (error) {
    actionError(detailPath, error);
  }
  revalidatePath("/");
  revalidatePath(detailPath);
  redirect(detailPath);
}

export async function recordSubsequentNotice(formData: FormData) {
  await requireAdmin();
  const pcnId = value(formData, "pcnId");
  const detailPath = `/pcns/${pcnId}`;
  try {
    if (!pcnId) throw new Error("PCN is required");
    const pcn = await prisma.pcn.findUnique({ where: { id: pcnId }, include: { vehicle: true } });
    if (!pcn || value(formData, "pcnReference").toUpperCase() !== pcn.reference || normalizeUkRegistration(value(formData, "registration")) !== pcn.vehicle.registrationNormalized) {
      throw new Error("Notice does not match this PCN and vehicle");
    }
    const evidenceDetails = optionalValue(formData, "evidenceDetails");
    if (evidenceDetails && evidenceDetails.length > 3000) throw new Error("Additional evidence details are too long");
    await prisma.subsequentNotice.create({ data: {
      pcnId,
      noticeType: enumValue(formData, "noticeType", noticeTypes),
      receivedDate: requiredDate(formData, "receivedDate"),
      hasNewInformation: value(formData, "hasNewInformation") === "yes",
      evidenceDetails,
    } });
  } catch (error) {
    actionError(detailPath, error);
  }
  revalidatePath("/");
  revalidatePath("/pcns");
  revalidatePath(detailPath);
  redirect(`${detailPath}?message=Subsequent%20notice%20recorded`);
}

export async function saveInvoiceEvidence(formData: FormData) {
  await requireAdmin();
  const pcnId = value(formData, "pcnId");
  const detailPath = `/pcns/${pcnId}`;
  try {
    if (!pcnId || !await prisma.pcn.findUnique({ where: { id: pcnId }, select: { id: true } })) throw new Error("PCN is required");
    const fields = ["reference", "deliveryAddress", "billingAddress", "recipient", "supplier", "description", "deliveryTime", "deliveryTimeEnd", "deliveryTimeKind", "otherFacts"] as const;
    const data = Object.fromEntries(fields.map((field) => [field, optionalValue(formData, field)])) as Record<typeof fields[number], string | null>;
    for (const field of fields) if ((data[field]?.length ?? 0) > 3000) throw new Error("One or more fields are too long");
    if (data.deliveryTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(data.deliveryTime)) throw new Error("Delivery time must use HH:mm");
    if (data.deliveryTimeEnd && !/^([01]\d|2[0-3]):[0-5]\d$/.test(data.deliveryTimeEnd)) throw new Error("Delivery time must use HH:mm");
    if (data.deliveryTimeKind && !["SCHEDULED_WINDOW", "CONFIRMED_TIME", "UNSPECIFIED"].includes(data.deliveryTimeKind)) throw new Error("Delivery time kind is invalid");
    if (data.deliveryTime && data.deliveryTimeEnd && data.deliveryTimeEnd <= data.deliveryTime) throw new Error("Delivery window end must be later than its start");
    const evidence = { ...data, invoiceDate: optionalDate(formData, "invoiceDate"), deliveryDate: optionalDate(formData, "deliveryDate") };
    await prisma.invoiceEvidence.upsert({ where: { pcnId }, create: { pcnId, ...evidence }, update: evidence });
  } catch (error) { actionError(detailPath, error); }
  revalidatePath(detailPath);
  redirect(`${detailPath}?message=Invoice%20evidence%20saved`);
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
  } catch (error) {
    logDatabaseError("Report generation", error);
    redirect(`/reports?error=${encodeURIComponent(classifyDatabaseError(error).explanation)}`);
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
  } catch (error) {
    logDatabaseError("Reminder completion", error);
    redirect(`/pcns/${pcnId}?error=${encodeURIComponent(classifyDatabaseError(error).explanation)}`);
  }
  revalidatePath(`/pcns/${pcnId}`);
  redirect(`/pcns/${pcnId}`);
}
