"use client";

import { useActionState } from "react";

import { login } from "@/app/auth-actions";

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [state, action, pending] = useActionState(login, { error: "" });
  return <form action={action} className="space-y-5">
    <input name="callbackUrl" type="hidden" value={callbackUrl} />
    {state.error && <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">{state.error}</p>}
    <label className="block text-sm font-medium text-slate-800">Username<input autoComplete="username" autoFocus className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2" name="username" required /></label>
    <label className="block text-sm font-medium text-slate-800">Password<input autoComplete="current-password" className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2" minLength={14} name="password" required type="password" /></label>
    <button className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60" disabled={pending} type="submit">{pending ? "Signing in…" : "Sign in"}</button>
  </form>;
}
