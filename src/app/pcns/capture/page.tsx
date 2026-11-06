import Link from "next/link";
import { PcnCaptureForm } from "@/components/pcn-capture-form";
import { ChatGptPcnImport } from "@/components/chatgpt-pcn-import";
import { DatabaseFailure } from "@/components/database-failure";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function CapturePcnPage() {
  let issuers;
  try {
    const { prisma } = await import("@/lib/prisma");
    issuers = await prisma.issuer.findMany({ select: { id: true, name: true, type: true }, orderBy: { name: "asc" } });
  } catch (error) {
    return <DatabaseFailure error={error} operation="PCN capture load" retryPath="/pcns/capture" />;
  }
  return <main className="min-h-screen bg-slate-50"><header className="border-b bg-white"><div className="px-4 py-6 sm:px-6 lg:px-8"><p className="warm-eyebrow">New PCN</p><h1 className="mt-1 text-3xl font-semibold">Capture a new PCN</h1><p className="mt-1 text-sm text-slate-600">Choose how to bring a notice into your workspace.</p></div></header><div className="space-y-5 px-4 py-8 sm:px-6 lg:px-8"><ChatGptPcnImport issuers={issuers} /><Card><CardHeader><CardTitle>2. Extract from photograph using the OpenAI API</CardTitle><p className="text-sm text-slate-600">Optional direct upload. Review every extracted field before saving.</p></CardHeader><CardContent><PcnCaptureForm issuers={issuers} /></CardContent></Card><Card><CardHeader><CardTitle>3. Enter manually</CardTitle></CardHeader><CardContent><Link className="underline" href="/pcns/new">Open manual PCN form</Link></CardContent></Card></div></main>;
}
