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

  return <main className="min-h-screen bg-slate-50"><header className="border-b bg-white"><div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-5 sm:px-6"><Link className="text-sm text-slate-600 underline" href="/pcns">PCNs</Link><span className="text-slate-300">/</span><h1 className="text-xl font-semibold">Manual PCN entry</h1></div></header><div className="mx-auto max-w-5xl space-y-4 px-4 py-8 sm:px-6"><Link className="inline-flex rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white" href="/pcns/capture">New PCN with AI capture</Link><Card><CardHeader><CardTitle>Manual PCN entry</CardTitle><p className="text-sm text-slate-600">Vehicle registrations are normalized and reused automatically.</p></CardHeader><CardContent><PcnForm action={createPcn} error={params.error} issuers={issuers} /></CardContent></Card></div></main>;
}
