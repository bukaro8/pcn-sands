import Link from "next/link";
import { FileSearch, Plus } from "lucide-react";

import type { ChallengeStatus, PaymentStatus, Prisma } from "@/generated/prisma/client";
import { StatusBadge } from "@/components/status-badge";
import { DatabaseFailure } from "@/components/database-failure";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { challengeStatuses, isOverdue, paymentStatuses, statusLabel } from "@/lib/pcn";
import { normalizeUkRegistration } from "@/lib/vehicles";

export const dynamic = "force-dynamic";

export default async function PcnListPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const search = params.search?.trim() ?? "";
  const where: Prisma.PcnWhereInput = {};
  if (search) where.OR = [{ reference: { contains: search, mode: "insensitive" } }, { vehicle: { registrationNormalized: { contains: normalizeUkRegistration(search) } } }, { issuer: { name: { contains: search, mode: "insensitive" } } }];
  if (challengeStatuses.includes(params.challengeStatus as (typeof challengeStatuses)[number])) where.challengeStatus = params.challengeStatus as ChallengeStatus;
  if (paymentStatuses.includes(params.paymentStatus as (typeof paymentStatuses)[number])) where.paymentStatus = params.paymentStatus as PaymentStatus;
  if (params.issuerId) where.issuerId = params.issuerId;
  if (params.vehicleId) where.vehicleId = params.vehicleId;

  let result;
  try {
    const { prisma } = await import("@/lib/prisma");
    result = await Promise.all([
    prisma.pcn.findMany({ where, include: { vehicle: true, issuer: true }, orderBy: [{ paymentDeadline: "asc" }, { updatedAt: "desc" }] }),
    prisma.issuer.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.vehicle.findMany({ select: { id: true, registrationDisplay: true }, orderBy: { registrationNormalized: "asc" } }),
    ]);
  } catch (error) {
    return <DatabaseFailure error={error} operation="PCN list load" retryPath="/pcns" />;
  }
  const [pcns, issuers, vehicles] = result;

  return <main className="min-h-screen bg-slate-50"><header className="border-b bg-white"><div className="flex items-center justify-between gap-4 px-4 py-6 sm:px-6 lg:px-8"><div><p className="warm-eyebrow">Case library</p><h1 className="mt-1 text-3xl font-semibold">PCNs</h1><p className="mt-1 text-sm text-slate-600">Search, filter and follow every notice.</p></div><Link className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white" href="/pcns/new"><Plus className="size-4" />Add PCN</Link></div></header><div className="space-y-6 px-4 py-8 sm:px-6 lg:px-8">{params.message && <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{params.message}</p>}<Card><CardHeader><CardTitle>Find a case</CardTitle><p className="text-sm text-slate-600">Narrow the workspace by status, issuer or vehicle.</p></CardHeader><CardContent><form className="grid gap-3 md:grid-cols-2 xl:grid-cols-5"><label className="text-sm font-medium">Search<input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-normal" defaultValue={search} name="search" placeholder="Reference, vehicle or issuer" /></label><label className="text-sm font-medium">Challenge<select className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-normal" defaultValue={params.challengeStatus ?? ""} name="challengeStatus"><option value="">All</option>{challengeStatuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label><label className="text-sm font-medium">Payment<select className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-normal" defaultValue={params.paymentStatus ?? ""} name="paymentStatus"><option value="">All</option>{paymentStatuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label><label className="text-sm font-medium">Issuer<select className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-normal" defaultValue={params.issuerId ?? ""} name="issuerId"><option value="">All</option>{issuers.map((issuer) => <option key={issuer.id} value={issuer.id}>{issuer.name}</option>)}</select></label><label className="text-sm font-medium">Vehicle<select className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-normal" defaultValue={params.vehicleId ?? ""} name="vehicleId"><option value="">All</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.registrationDisplay}</option>)}</select></label><div className="flex items-end gap-3"><button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white" type="submit">Apply filters</button><Link className="px-2 py-2 text-sm font-medium underline" href="/pcns">Clear</Link></div></form></CardContent></Card><Card><CardHeader><CardTitle>{pcns.length} PCN{pcns.length === 1 ? "" : "s"}</CardTitle></CardHeader><CardContent>{pcns.length ? <><div className="mobile-case-list space-y-3">{pcns.map((pcn) => <Link className="block rounded-2xl border p-4" href={`/pcns/${pcn.id}`} key={pcn.id}><div className="flex items-start justify-between gap-3"><div><strong>{pcn.reference}</strong><p className="mt-1 text-sm text-slate-600">{pcn.vehicle.registrationDisplay} · {pcn.issuer.name}</p></div><StatusBadge status={pcn.challengeStatus} /></div><div className="mt-3 flex items-center justify-between text-xs text-slate-500"><StatusBadge status={pcn.paymentStatus} /><span>{pcn.paymentDeadline ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(pcn.paymentDeadline) : "No deadline"}</span></div></Link>)}</div><div className="desktop-case-table overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm"><thead className="border-b text-slate-500"><tr><th className="pb-3 font-medium">Reference</th><th className="pb-3 font-medium">Vehicle</th><th className="pb-3 font-medium">Issuer</th><th className="pb-3 font-medium">Challenge</th><th className="pb-3 font-medium">Payment</th><th className="pb-3 font-medium">Deadline</th></tr></thead><tbody>{pcns.map((pcn) => <tr className="border-b border-slate-100 last:border-0" key={pcn.id}><td className="py-4 font-medium"><Link className="underline" href={`/pcns/${pcn.id}`}>{pcn.reference}</Link></td><td className="py-4">{pcn.vehicle.registrationDisplay}</td><td className="py-4">{pcn.issuer.name}</td><td className="py-4"><StatusBadge status={pcn.challengeStatus} /></td><td className="py-4"><StatusBadge status={pcn.paymentStatus} /></td><td className={isOverdue(pcn.paymentStatus, pcn.paymentDeadline) ? "py-4 font-medium text-rose-700" : "py-4"}>{pcn.paymentDeadline ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(pcn.paymentDeadline) : "—"}</td></tr>)}</tbody></table></div></> : <div className="empty-state"><FileSearch className="size-8" /><strong>No cases found</strong><span>Try clearing a filter or add a new PCN.</span></div>}</CardContent></Card></div></main>;
}
