import Link from "next/link";
import { ArrowRight, CalendarClock, CheckCircle2, Coffee, FileText, Plus, WalletCards, XCircle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { DatabaseFailure } from "@/components/database-failure";
import { formatDate, isOverdue } from "@/lib/pcn";

export const dynamic = "force-dynamic";

function londonGreeting(now: Date) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Europe/London" }).format(now));
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function Dashboard() {
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
    ]);
  } catch (error) {
    return <DatabaseFailure error={error} operation="Dashboard load" retryPath="/" />;
  }
  const [active, awaitingChallenge, pending, outstanding, accepted, rejected, overdue, upcoming] = result;
  const username = process.env.ADMIN_USERNAME?.trim() || "there";
  const stats = [
    { label: "Active PCNs", value: active, icon: FileText, href: "/pcns" },
    { label: "Awaiting challenge", value: awaitingChallenge, icon: CalendarClock, href: "/pcns?challengeStatus=AWAITING_CHALLENGE" },
    { label: "Pending decisions", value: pending, icon: CalendarClock, href: "/pcns?challengeStatus=AWAITING_DECISION" },
    { label: "Outstanding payments", value: outstanding, icon: WalletCards, href: "/pcns?paymentStatus=PAYMENT_REQUIRED" },
  ];

  return <main className="min-h-screen bg-slate-50"><div className="space-y-8 px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
    <section className="warm-hero"><div className="relative z-10 w-full"><p className="warm-eyebrow">Your daily workspace</p><h1 className="warm-title">{londonGreeting(now)}, {username}!</h1><p className="warm-subtitle">Here’s the shape of today’s PCN work. Focus on the urgent items, then enjoy the quieter moments.</p><div className="briefing-grid sm:grid-cols-4"><div className="briefing-item"><strong>{awaitingChallenge}</strong><span>to prepare</span></div><div className="briefing-item"><strong>{pending}</strong><span>awaiting decisions</span></div><div className="briefing-item"><strong>{accepted}</strong><span>accepted</span></div><div className="briefing-item"><strong>{overdue.length + upcoming.length}</strong><span>urgent deadlines</span></div></div></div></section>
    <section><div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="warm-eyebrow">At a glance</p><h2 className="mt-1 text-2xl font-semibold">Case overview</h2></div><Link className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white" href="/pcns/capture"><Plus className="size-4" />Capture a PCN</Link></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{stats.map(({ label, value, icon: Icon, href }) => <Link className="group block" href={href} key={label}><Card className="h-full transition-transform group-hover:-translate-y-1"><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3"><CardTitle className="text-sm text-slate-600">{label}</CardTitle><span className="rounded-xl bg-slate-100 p-2"><Icon className="size-5 text-slate-500" /></span></CardHeader><CardContent className="flex items-end justify-between"><p className="text-4xl font-semibold">{value}</p><ArrowRight className="size-4 text-slate-500 transition-transform group-hover:translate-x-1" /></CardContent></Card></Link>)}</div></section>
    <section className="grid gap-6 xl:grid-cols-[1.25fr_.75fr]"><div className="grid gap-6 lg:grid-cols-2"><PaymentList title="Overdue payments" items={overdue} empty="No overdue payment deadlines." /><PaymentList title="Coming up this week" items={upcoming} empty="No payment deadlines in the next seven days." /></div><Card><CardHeader><p className="warm-eyebrow">Outcomes</p><CardTitle>Challenge results</CardTitle></CardHeader><CardContent className="space-y-4"><div className="flex items-center justify-between rounded-2xl bg-emerald-50 p-4"><span className="flex items-center gap-3"><CheckCircle2 className="size-5 text-emerald-800" />Accepted</span><strong className="text-xl">{accepted}</strong></div><div className="flex items-center justify-between rounded-2xl bg-rose-50 p-4"><span className="flex items-center gap-3"><XCircle className="size-5 text-rose-700" />Rejected</span><strong className="text-xl">{rejected}</strong></div>{active === 0 && outstanding === 0 && <div className="empty-state"><Coffee className="size-7" /><strong>All caught up! ☕</strong><span>There are no active cases or outstanding payments.</span></div>}</CardContent></Card></section>
  </div></main>;
}

function PaymentList({ title, items, empty }: { title: string; items: Array<{ id: string; reference: string; paymentDeadline: Date | null; paymentStatus: string; vehicle: { registrationDisplay: string } }>; empty: string }) {
  return <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent>{items.length ? <ul className="space-y-3">{items.map((pcn) => <li className="flex items-center justify-between gap-3 rounded-xl border p-3" key={pcn.id}><div><Link className="font-semibold underline" href={`/pcns/${pcn.id}`}>{pcn.reference}</Link><p className="mt-1 text-xs text-slate-500">{pcn.vehicle.registrationDisplay} · Due {formatDate(pcn.paymentDeadline)}</p></div><StatusBadge className={isOverdue(pcn.paymentStatus, pcn.paymentDeadline) ? "ring-1 ring-rose-400" : undefined} status={pcn.paymentStatus} /></li>)}</ul> : <div className="empty-state"><Coffee className="size-6" /><strong>Nothing pressing</strong><span>{empty}</span></div>}</CardContent></Card>;
}
