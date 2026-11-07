import { CaptureWorkflows } from "@/components/capture-workflows";
import { DatabaseFailure } from "@/components/database-failure";
import { ThemeToggle } from "@/components/theme-toggle";

export const dynamic = "force-dynamic";

export default async function CapturePcnPage() {
  let issuers;
  try {
    const { prisma } = await import("@/lib/prisma");
    issuers = await prisma.issuer.findMany({ select: { id: true, name: true, type: true }, orderBy: { name: "asc" } });
  } catch (error) {
    return <DatabaseFailure error={error} operation="PCN capture load" retryPath="/pcns/capture" />;
  }
  return <main className="min-h-screen bg-slate-50"><header className="border-b bg-white"><div className="px-4 py-6 sm:px-6 lg:px-8"><div className="capture-mobile-theme"><ThemeToggle /></div><p className="warm-eyebrow">New PCN</p><h1 className="mt-1 text-3xl font-semibold">Capture a new PCN</h1><p className="mt-1 text-sm text-slate-600">Choose the way that works best for this notice.</p></div></header><div className="px-4 py-8 sm:px-6 lg:px-8"><CaptureWorkflows issuers={issuers} /></div></main>;
}
