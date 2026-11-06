import { PcnCaptureForm } from "@/components/pcn-capture-form";
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
  return <main className="min-h-screen bg-slate-50"><header className="border-b bg-white"><div className="px-4 py-6 sm:px-6 lg:px-8"><p className="warm-eyebrow">Camera & document capture</p><h1 className="mt-1 text-3xl font-semibold">Capture a new PCN</h1><p className="mt-1 text-sm text-slate-600">Photograph or upload, then review every extracted detail.</p></div></header><div className="px-4 py-8 sm:px-6 lg:px-8"><Card><CardHeader><CardTitle>AI-assisted capture</CardTitle><p className="text-sm text-slate-600">Review every extracted field before saving. Missing fields remain blank.</p></CardHeader><CardContent><PcnCaptureForm issuers={issuers} /></CardContent></Card></div></main>;
}
