import { LoginForm } from "@/app/login/login-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const { callbackUrl = "/" } = await searchParams;
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4"><Card className="w-full max-w-md"><CardHeader><CardTitle>Sands PCN Management</CardTitle><p className="text-sm text-slate-600">Sign in to manage PCNs, reports and reminders.</p></CardHeader><CardContent><LoginForm callbackUrl={callbackUrl} /></CardContent></Card></main>;
}
