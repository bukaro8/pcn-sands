import Link from "next/link";

import { createPcn } from "@/app/actions";
import { PcnForm } from "@/components/pcn-form";
import { DatabaseFailure } from "@/components/database-failure";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function NewPcnPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  let issuers;
  try {
    const { prisma } = await import("@/lib/prisma");
    issuers = await prisma.issuer.findMany({ select: { id: true, name: true, type: true }, orderBy: { name: "asc" } });
  } catch (error) {
    return <DatabaseFailure error={error} operation="New PCN form load" retryPath="/pcns/new" />;
  }
  const params = await searchParams;

  return <main className="min-h-screen bg-slate-50"><header className="border-b bg-white"><div className="flex items-end justify-between gap-4 px-4 py-6 sm:px-6 lg:px-8"><div><p className="warm-eyebrow">Manual entry</p><h1 className="mt-1 text-3xl font-semibold">Create a PCN</h1><p className="mt-1 text-sm text-slate-600">Add a case carefully, one useful detail at a time.</p></div><Link className="inline-flex rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white" href="/pcns/capture">Use AI capture</Link></div></header><div className="space-y-4 px-4 py-8 sm:px-6 lg:px-8"><Card><CardHeader><CardTitle>PCN information</CardTitle><p className="text-sm text-slate-600">Vehicle registrations are normalised and reused automatically.</p></CardHeader><CardContent><PcnForm action={createPcn} error={params.error} issuers={issuers} /></CardContent></Card></div></main>;
}
