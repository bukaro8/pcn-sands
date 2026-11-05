import Link from "next/link";

import { PcnCaptureForm } from "@/components/pcn-capture-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function CapturePcnPage() {
  const issuers = await prisma.issuer.findMany({ select: { id: true, name: true, type: true }, orderBy: { name: "asc" } });
  return <main className="min-h-screen bg-slate-50"><header className="border-b bg-white"><div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-5 sm:px-6"><Link className="text-sm text-slate-600 underline" href="/">Dashboard</Link><span className="text-slate-300">/</span><h1 className="text-xl font-semibold">New PCN</h1></div></header><div className="mx-auto max-w-3xl px-4 py-8 sm:px-6"><Card><CardHeader><CardTitle>AI-assisted PCN capture</CardTitle><p className="text-sm text-slate-600">Review every extracted field before saving. Missing fields remain blank.</p></CardHeader><CardContent><PcnCaptureForm issuers={issuers} /></CardContent></Card></div></main>;
}
