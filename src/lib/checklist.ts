import type { ChecklistTaskType } from "@/generated/prisma/client";

import { prisma } from "@/lib/prisma";

export type ChecklistTaskView = {
  id: string;
  taskKey: string;
  type: ChecklistTaskType;
  pcnId: string;
  challengeId: string | null;
  reminderId: string | null;
  dueAt: Date;
  completedAt: Date | null;
  reference: string;
  registration: string;
};

type Candidate = Omit<ChecklistTaskView, "id" | "completedAt" | "reference" | "registration">;

function londonParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { weekday: value("weekday"), hour: Number(value("hour")), key: `${value("year")}-${value("month")}-${value("day")}` };
}

export function isWeekdayMidday(now = new Date()) {
  const parts = londonParts(now);
  return ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(parts.weekday) && parts.hour === 12;
}

export function londonDateKey(now = new Date()) {
  return londonParts(now).key;
}

function dayEnd(now: Date) {
  const key = londonDateKey(now);
  const start = new Date(`${key}T00:00:00.000Z`);
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 1);
  return end;
}

function priority(type: ChecklistTaskType) {
  if (type === "CHALLENGE_STATUS_CHECK") return 1;
  if (type === "REVIEW_DECISION") return 2;
  if (type === "REVIEW_SUBSEQUENT_NOTICE") return 3;
  return 4;
}

function sortTasks(left: ChecklistTaskView, right: ChecklistTaskView) {
  const leftOverdue = left.dueAt.getTime() < Date.now(); const rightOverdue = right.dueAt.getTime() < Date.now();
  if (leftOverdue !== rightOverdue) return leftOverdue ? -1 : 1;
  const priorityDifference = priority(left.type) - priority(right.type);
  if (priorityDifference) return priorityDifference;
  return left.dueAt.getTime() - right.dueAt.getTime();
}

export async function getDailyChecklist(now = new Date()): Promise<ChecklistTaskView[]> {
  const end = dayEnd(now);
  const pcns = await prisma.pcn.findMany({
    where: {
      OR: [
        { challengeStatus: "AWAITING_CHALLENGE" },
        { challenges: { some: { outcome: { in: ["ACCEPTED", "REJECTED"] }, decisionDate: { lte: end } } } },
        { reminders: { some: { type: "CHALLENGE_STATUS_CHECK", status: { in: ["PENDING", "NOTIFIED"] }, dueAt: { lt: end } } } },
        { subsequentNotices: { some: { hasNewInformation: true } } },
      ],
    },
    include: {
      vehicle: true,
      challenges: { where: { outcome: { in: ["ACCEPTED", "REJECTED"] }, decisionDate: { lte: end } }, orderBy: { decisionDate: "desc" } },
      reminders: { where: { type: "CHALLENGE_STATUS_CHECK", status: { in: ["PENDING", "NOTIFIED"] }, dueAt: { lt: end } }, include: { challenge: true } },
      subsequentNotices: { where: { hasNewInformation: true }, orderBy: { receivedDate: "desc" } },
    },
  });

  const byKey = new Map<string, Candidate>();
  for (const pcn of pcns) {
    if (pcn.challengeStatus === "AWAITING_CHALLENGE") {
      byKey.set(`prepare-challenge:${pcn.id}`, { taskKey: `prepare-challenge:${pcn.id}`, type: "PREPARE_CHALLENGE", pcnId: pcn.id, challengeId: null, reminderId: null, dueAt: pcn.issueDate });
    }
    if (pcn.challengeStatus === "AWAITING_DECISION") {
      for (const reminder of pcn.reminders) {
        if (reminder.challenge?.outcome !== "PENDING") continue;
        byKey.set(`status-check:${reminder.id}`, { taskKey: `status-check:${reminder.id}`, type: "CHALLENGE_STATUS_CHECK", pcnId: pcn.id, challengeId: reminder.challengeId, reminderId: reminder.id, dueAt: reminder.dueAt });
      }
    }
    for (const challenge of pcn.challenges) {
      byKey.set(`review-decision:${challenge.id}`, { taskKey: `review-decision:${challenge.id}`, type: "REVIEW_DECISION", pcnId: pcn.id, challengeId: challenge.id, reminderId: null, dueAt: challenge.decisionDate ?? end });
    }
    for (const notice of pcn.subsequentNotices) {
      byKey.set(`review-subsequent-notice:${notice.id}`, { taskKey: `review-subsequent-notice:${notice.id}`, type: "REVIEW_SUBSEQUENT_NOTICE", pcnId: pcn.id, challengeId: null, reminderId: null, dueAt: notice.receivedDate });
    }
  }

  const candidates = [...byKey.values()];
  for (const candidate of candidates) {
    await prisma.checklistTask.upsert({
      where: { taskKey: candidate.taskKey },
      create: candidate,
      update: { dueAt: candidate.dueAt },
    });
  }
  const records = await prisma.checklistTask.findMany({ where: { taskKey: { in: candidates.map((candidate) => candidate.taskKey) }, completedAt: null }, include: { pcn: { include: { vehicle: true } } } });
  return records.map((record) => ({ id: record.id, taskKey: record.taskKey, type: record.type, pcnId: record.pcnId, challengeId: record.challengeId, reminderId: record.reminderId, dueAt: record.dueAt, completedAt: record.completedAt, reference: record.pcn.reference, registration: record.pcn.vehicle.registrationDisplay })).sort(sortTasks);
}

export async function getDailyChecklistProgress(now = new Date()) {
  const tasks = await getDailyChecklist(now);
  const start = new Date(`${londonDateKey(now)}T00:00:00.000Z`);
  const completed = await prisma.checklistTask.count({ where: { completedAt: { gte: start, lt: dayEnd(now) } } });
  return { tasks, completed, total: tasks.length + completed };
}

export async function completeChecklistTask(taskId: string) {
  const task = await prisma.checklistTask.findUnique({ where: { id: taskId }, include: { reminder: true } });
  if (!task) return false;
  if (task.completedAt) return true;
  await prisma.$transaction([
    prisma.checklistTask.update({ where: { id: taskId }, data: { completedAt: new Date() } }),
    ...(task.reminderId && task.reminder?.status !== "COMPLETED" ? [prisma.reminder.update({ where: { id: task.reminderId }, data: { status: "COMPLETED", completedAt: new Date() } })] : []),
  ]);
  return true;
}
