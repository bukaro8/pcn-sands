import Link from "next/link";
import { AlertCircle, ArrowRight, CalendarClock, CheckCircle2, CheckSquare, CircleCheck, Coffee, FileText, Plus, WalletCards, XCircle } from "lucide-react";

import { completeChecklistTaskAction } from "@/app/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { DatabaseFailure } from "@/components/database-failure";
import { getDailyChecklistProgress, type ChecklistTaskView } from "@/lib/checklist";
import { formatDate, isOverdue } from "@/lib/pcn";

export const dynamic = "force-dynamic";

function londonGreeting(now: Date) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Europe/London" }).format(now));
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ completed?: string }> }) {
  const query = await searchParams;
  const now = new Date();
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const soon = new Date(today); soon.setUTCDate(today.getUTCDate() + 7);
  let result;
  try {
    const { prisma } = await import("@/lib/prisma");
    result = await Promise.all([
      prisma.pcn.count({ where: { OR: [{ challengeStatus: { in: ["AWAITING_CHALLENGE", "AWAITING_DECISION"] } }, { challengeStatus: "REJECTED", paymentStatus: { in: ["PAYMENT_REQUIRED", "PAYMENT_UNCONFIRMED"] } }] } }),
      prisma.pcn.count({ where: { challengeStatus: "AWAITING_CHALLENGE" } }),
      prisma.pcn.count({ where: { challengeStatus: "AWAITING_DECISION" } }),
      prisma.pcn.count({ where: { paymentStatus: { in: ["PAYMENT_REQUIRED", "PAYMENT_UNCONFIRMED"] } } }),
      prisma.pcn.count({ where: { challengeStatus: "ACCEPTED" } }),
      prisma.pcn.count({ where: { challengeStatus: "REJECTED" } }),
      prisma.pcn.findMany({ where: { paymentStatus: { in: ["PAYMENT_REQUIRED", "PAYMENT_UNCONFIRMED"] }, paymentDeadline: { lt: today } }, include: { vehicle: true }, take: 5, orderBy: { paymentDeadline: "asc" } }),
      prisma.pcn.findMany({ where: { paymentStatus: { in: ["PAYMENT_REQUIRED", "PAYMENT_UNCONFIRMED"] }, paymentDeadline: { gte: today, lte: soon } }, include: { vehicle: true }, take: 5, orderBy: { paymentDeadline: "asc" } }),
      prisma.challenge.findMany({ where: { outcome: "PENDING", submissionDate: { not: null }, nextStatusCheckDate: { not: null } }, include: { pcn: { include: { vehicle: true } } }, take: 5, orderBy: { nextStatusCheckDate: "asc" } }),
      getDailyChecklistProgress(now),
    ]);
  } catch (error) {
    return <DatabaseFailure error={error} operation="Dashboard load" retryPath="/" />;
  }
  const [active, awaitingChallenge, pending, outstanding, accepted, rejected, overdue, upcoming, statusChecks, checklist] = result;
  const username = process.env.ADMIN_USERNAME?.trim() || "there";
  const stats = [
    { label: "Active PCNs", value: active, icon: FileText, href: "/pcns" },
    { label: "Awaiting challenge", value: awaitingChallenge, icon: CalendarClock, href: "/pcns?challengeStatus=AWAITING_CHALLENGE" },
    { label: "Pending decisions", value: pending, icon: CalendarClock, href: "/pcns?challengeStatus=AWAITING_DECISION" },
    { label: "Outstanding payments", value: outstanding, icon: WalletCards, href: "/pcns?paymentStatus=PAYMENT_REQUIRED" },
  ];

  return <main className="min-h-screen bg-slate-50"><div className="space-y-8 px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
    <section className="warm-hero"><div className="relative z-10 w-full"><p className="warm-eyebrow">Your daily workspace</p><h1 className="warm-title">{londonGreeting(now)}, {username}!</h1><p className="warm-subtitle">{checklist.total ? `You have ${checklist.total} item${checklist.total === 1 ? "" : "s"} requiring attention today. Start with the most urgent case, then work through the rest at your own pace.` : "Nothing needs your attention today. Your casework is in good shape."}</p><div className="briefing-grid sm:grid-cols-4"><div className="briefing-item"><strong>{checklist.tasks.length}</strong><span>tasks to do today</span></div><div className="briefing-item"><strong>{awaitingChallenge}</strong><span>to prepare</span></div><div className="briefing-item"><strong>{pending}</strong><span>awaiting decisions</span></div><div className="briefing-item"><strong>{overdue.length + upcoming.length}</strong><span>urgent deadlines</span></div></div></div></section>
    {query.completed && <p className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800" role="status">Task completed - the case itself was not changed.</p>}
    <DailyChecklist completed={checklist.completed} now={now} tasks={checklist.tasks} total={checklist.total} />
    <section><div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="warm-eyebrow">At a glance</p><h2 className="mt-1 text-2xl font-semibold">Case overview</h2></div><Link className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white" href="/pcns/capture"><Plus className="size-4" />Capture a PCN</Link></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{stats.map(({ label, value, icon: Icon, href }) => <Link className="group block" href={href} key={label}><Card className="h-full transition-transform group-hover:-translate-y-1"><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3"><CardTitle className="text-sm text-slate-600">{label}</CardTitle><span className="rounded-xl bg-slate-100 p-2"><Icon className="size-5 text-slate-500" /></span></CardHeader><CardContent className="flex items-end justify-between"><p className="text-4xl font-semibold">{value}</p><ArrowRight className="size-4 text-slate-500 transition-transform group-hover:translate-x-1" /></CardContent></Card></Link>)}</div></section>
    <section className="grid gap-6 xl:grid-cols-[1.25fr_.75fr]"><div className="grid gap-6 lg:grid-cols-2"><div className="lg:col-span-2"><StatusCheckList items={statusChecks} /></div><PaymentList title="Overdue payments" items={overdue} empty="No overdue payment deadlines." /><PaymentList title="Coming up this week" items={upcoming} empty="No payment deadlines in the next seven days." /></div><Card><CardHeader><p className="warm-eyebrow">Outcomes</p><CardTitle>Challenge results</CardTitle></CardHeader><CardContent className="space-y-4"><div className="flex items-center justify-between rounded-2xl bg-emerald-50 p-4"><span className="flex items-center gap-3"><CheckCircle2 className="size-5 text-emerald-800" />Accepted</span><strong className="text-xl">{accepted}</strong></div><div className="flex items-center justify-between rounded-2xl bg-rose-50 p-4"><span className="flex items-center gap-3"><XCircle className="size-5 text-rose-700" />Rejected</span><strong className="text-xl">{rejected}</strong></div>{active === 0 && outstanding === 0 && <div className="empty-state"><Coffee className="size-7" /><strong>All caught up! ☕</strong><span>There are no active cases or outstanding payments.</span></div>}</CardContent></Card></section>
  </div></main>;
}

function DailyChecklist({ tasks, completed, total, now }: { tasks: ChecklistTaskView[]; completed: number; total: number; now: Date }) {
  const finished = total > 0 && completed >= total;
  return <section className="checklist-panel"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="warm-eyebrow">Personal assistant</p><h2 className="mt-1 text-2xl font-semibold">Today&apos;s checklist</h2><p className="mt-2 text-sm text-slate-600">Acknowledge the work here, then update the case only when you have actually done it.</p></div><div className="checklist-progress" aria-label={`${completed} of ${total} tasks completed`}><strong>{completed}/{total || 0}</strong><span>completed</span></div></div>{total > 0 && <div className="mt-5"><div className="checklist-progress-track"><span style={{ width: `${Math.min(100, (completed / total) * 100)}%` }} /></div></div>}{finished ? <div className="checklist-finished"><CircleCheck className="size-7" /><div><strong>All done for today! ☕</strong><p>Lovely work. Your checklist is complete.</p></div></div> : tasks.length ? <div className="mt-5 space-y-3">{tasks.map((task) => <ChecklistRow key={task.id} now={now} task={task} />)}</div> : <div className="checklist-empty"><CheckSquare className="size-8" /><strong>Nothing needs your attention today</strong><span>There are no actionable checklist items right now.</span></div>}</section>;
}

function ChecklistRow({ task, now }: { task: ChecklistTaskView; now: Date }) {
  const overdue = task.dueAt.getTime() < now.getTime();
  const title = task.type === "PREPARE_CHALLENGE" ? "Prepare or submit challenge" : task.type === "CHALLENGE_STATUS_CHECK" ? "Check challenge status" : task.type === "REVIEW_SUBSEQUENT_NOTICE" ? "Review new notice information" : "Review recorded decision";
  return <div className={`checklist-row ${overdue ? "is-overdue" : ""}`}><span className="checklist-icon">{overdue ? <AlertCircle className="size-5" /> : <CalendarClock className="size-5" />}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong>{title}</strong><span className="checklist-urgency">{overdue ? "Overdue" : `Due ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Europe/London" }).format(task.dueAt)}`}</span></div><p className="mt-1 text-sm text-slate-600">{task.registration} · {task.reference}</p></div><div className="flex items-center gap-2"><a className="checklist-case-link" href={`/pcns/${task.pcnId}`}>Open case</a><form action={completeChecklistTaskAction}><input name="taskId" type="hidden" value={task.id} /><button aria-label={`Complete ${title} for ${task.reference}`} className="checklist-complete" title="Mark checklist item complete" type="submit"><CheckSquare className="size-5" /></button></form></div></div>;
}

function PaymentList({ title, items, empty }: { title: string; items: Array<{ id: string; reference: string; paymentDeadline: Date | null; paymentStatus: string; vehicle: { registrationDisplay: string } }>; empty: string }) {
  return <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent>{items.length ? <ul className="space-y-3">{items.map((pcn) => <li className="flex items-center justify-between gap-3 rounded-xl border p-3" key={pcn.id}><div><Link className="font-semibold underline" href={`/pcns/${pcn.id}`}>{pcn.reference}</Link><p className="mt-1 text-xs text-slate-500">{pcn.vehicle.registrationDisplay} · Due {formatDate(pcn.paymentDeadline)}</p></div><StatusBadge className={isOverdue(pcn.paymentStatus, pcn.paymentDeadline) ? "ring-1 ring-rose-400" : undefined} status={pcn.paymentStatus} /></li>)}</ul> : <div className="empty-state"><Coffee className="size-6" /><strong>Nothing pressing</strong><span>{empty}</span></div>}</CardContent></Card>;
}

function StatusCheckList({ items }: { items: Array<{ id: string; nextStatusCheckDate: Date | null; pcn: { id: string; reference: string; vehicle: { registrationDisplay: string } } }> }) {
  return <Card><CardHeader><p className="warm-eyebrow">Challenge follow-up</p><CardTitle>Next status checks</CardTitle><p className="text-sm text-slate-600">Administrative follow-up dates only — separate from payment and appeal deadlines.</p></CardHeader><CardContent>{items.length ? <ul className="grid gap-3 sm:grid-cols-2">{items.map((challenge) => <li className="flex items-center justify-between gap-3 rounded-xl border p-3" key={challenge.id}><div><Link className="font-semibold underline" href={`/pcns/${challenge.pcn.id}`}>{challenge.pcn.vehicle.registrationDisplay}</Link><p className="mt-1 text-xs text-slate-500">{challenge.pcn.reference} · Check {formatDate(challenge.nextStatusCheckDate)}</p></div><CalendarClock className="size-5 text-[var(--primary)]" /></li>)}</ul> : <div className="empty-state"><Coffee className="size-6" /><strong>No follow-ups scheduled</strong><span>Submitted challenges with a check date will appear here.</span></div>}</CardContent></Card>;
}
