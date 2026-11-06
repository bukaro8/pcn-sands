import Link from "next/link";
import { CalendarClock, FileText, Plus, WalletCards } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { logout } from "@/app/auth-actions";
import { StatusBadge } from "@/components/status-badge";
import { DatabaseFailure } from "@/components/database-failure";
import { formatDate, isOverdue } from "@/lib/pcn";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
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
    prisma.pcn.findMany({ where: { paymentStatus: { in: ["PAYMENT_REQUIRED", "PAYMENT_UNCONFIRMED"] }, paymentDeadline: { lt: today } }, include: { vehicle: true }, take: 5, orderBy: { paymentDeadline: "asc" } }),
    prisma.pcn.findMany({ where: { paymentStatus: { in: ["PAYMENT_REQUIRED", "PAYMENT_UNCONFIRMED"] }, paymentDeadline: { gte: today, lte: soon } }, include: { vehicle: true }, take: 5, orderBy: { paymentDeadline: "asc" } }),
    ]);
  } catch (error) {
    return <DatabaseFailure error={error} operation="Dashboard load" retryPath="/" />;
  }
  const [active, awaitingChallenge, pending, outstanding, overdue, upcoming] = result;
  const stats = [{ label: "Active PCNs", value: active, icon: FileText }, { label: "Awaiting challenge", value: awaitingChallenge, icon: CalendarClock }, { label: "Pending decisions", value: pending, icon: CalendarClock }, { label: "Outstanding payments", value: outstanding, icon: WalletCards }];
  return <main className="min-h-screen bg-slate-50"><header className="border-b bg-white"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8"><div><p className="text-sm font-medium text-slate-500">Operations</p><h1 className="text-xl font-semibold">PCN Management</h1></div><nav className="flex items-center gap-3" aria-label="Primary navigation"><Link className="text-sm font-medium underline" href="/pcns">PCNs</Link><Link className="text-sm font-medium underline" href="/reports">Reports</Link><Link className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white" href="/pcns/capture"><Plus className="size-4" />New PCN</Link><form action={logout}><button className="text-sm font-medium underline" type="submit">Sign out</button></form></nav></div></header><div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8"><section><div className="mb-5 flex items-end justify-between"><div><h2 className="text-2xl font-semibold">Dashboard</h2><p className="mt-1 text-sm text-slate-600">Current PCN, challenge and payment work.</p></div><Link className="text-sm font-medium underline" href="/reports">Generate reports</Link></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{stats.map(({ label, value, icon: Icon }) => <Card key={label}><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3"><CardTitle className="text-sm text-slate-600">{label}</CardTitle><Icon className="size-5 text-slate-500" /></CardHeader><CardContent><p className="text-3xl font-semibold">{value}</p></CardContent></Card>)}</div></section><section className="grid gap-6 lg:grid-cols-2"><PaymentList title="Overdue payments" items={overdue} empty="No overdue payment deadlines." /><PaymentList title="Upcoming payment deadlines" items={upcoming} empty="No payment deadlines in the next seven days." /></section></div></main>;
}

function PaymentList({ title, items, empty }: { title: string; items: Array<{ id: string; reference: string; paymentDeadline: Date | null; paymentStatus: string; vehicle: { registrationDisplay: string } }>; empty: string }) {
  return <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent>{items.length ? <ul className="space-y-3">{items.map((pcn) => <li className="flex items-center justify-between gap-3" key={pcn.id}><div><Link className="font-medium underline" href={`/pcns/${pcn.id}`}>{pcn.reference}</Link><p className="text-xs text-slate-500">{pcn.vehicle.registrationDisplay} · Due {formatDate(pcn.paymentDeadline)}</p></div><StatusBadge className={isOverdue(pcn.paymentStatus, pcn.paymentDeadline) ? "ring-1 ring-rose-400" : undefined} status={pcn.paymentStatus} /></li>)}</ul> : <p className="text-sm text-slate-600">{empty}</p>}</CardContent></Card>;
}
