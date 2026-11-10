"use client";

import { useState } from "react";
import { CheckCircle2, ClipboardCheck, XCircle } from "lucide-react";

import { updateChallenge } from "@/app/actions";
import { paymentStatuses, statusLabel } from "@/lib/pcn";

type Props = {
  pcnId: string;
  challengeId: string;
  currentOutcome: "PENDING" | "ACCEPTED" | "REJECTED";
  decisionDate: string;
  decisionNotes: string;
  paymentStatus: string;
  paymentDeadline: string;
  paymentAmount: string;
  paymentReference: string;
};

export function ChallengeDecisionDialog({ pcnId, challengeId, currentOutcome, decisionDate, decisionNotes, paymentStatus, paymentDeadline, paymentAmount, paymentReference }: Props) {
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<"ACCEPTED" | "REJECTED">(currentOutcome === "REJECTED" ? "REJECTED" : "ACCEPTED");
  const pending = currentOutcome === "PENDING";

  return <>
    <button className={pending ? "inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--surface)] shadow-sm hover:brightness-110" : "inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--line)] px-4 py-2 text-sm font-semibold"} onClick={() => setOpen(true)} type="button"><ClipboardCheck className="size-4" />{pending ? "Record decision" : "Edit decision"}</button>
    {open && <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-3 sm:items-center sm:p-6" onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false); }}>
      <section aria-labelledby={`decision-title-${challengeId}`} aria-modal="true" className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-5 text-[var(--ink)] shadow-2xl sm:p-6" role="dialog">
        <h2 className="font-serif text-2xl" id={`decision-title-${challengeId}`}>{pending ? "Record challenge decision" : "Edit challenge decision"}</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Record only the issuer&apos;s confirmed response. Status-check dates remain separate from payment and appeal deadlines.</p>
        <form action={updateChallenge} className="mt-5 space-y-5">
          <input name="pcnId" type="hidden" value={pcnId} />
          <input name="challengeId" type="hidden" value={challengeId} />
          <fieldset><legend className="text-sm font-semibold">Decision</legend><div className="mt-2 grid grid-cols-2 gap-3"><label className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border p-3 ${outcome === "ACCEPTED" ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "border-[var(--line)]"}`}><input checked={outcome === "ACCEPTED"} className="size-4" name="outcome" onChange={() => setOutcome("ACCEPTED")} type="radio" value="ACCEPTED" /><CheckCircle2 className="size-5 text-[var(--primary)]" /><span className="font-semibold">Accepted</span></label><label className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border p-3 ${outcome === "REJECTED" ? "border-[var(--terracotta)] bg-rose-50" : "border-[var(--line)]"}`}><input checked={outcome === "REJECTED"} className="size-4" name="outcome" onChange={() => setOutcome("REJECTED")} type="radio" value="REJECTED" /><XCircle className="size-5 text-[var(--terracotta)]" /><span className="font-semibold">Rejected</span></label></div></fieldset>
          <label className="block text-sm font-semibold">Decision date<input className="mt-2 min-h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[var(--ink)]" defaultValue={decisionDate} name="decisionDate" required type="date" /></label>
          <label className="block text-sm font-semibold">Decision notes <span className="font-normal text-[var(--muted)]">(optional)</span><textarea className="mt-2 min-h-24 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[var(--ink)]" defaultValue={decisionNotes} maxLength={4000} name="decisionNotes" placeholder="Record any useful wording or instructions from the decision." rows={3} /></label>
          {outcome === "REJECTED" && <fieldset className="grid gap-4 rounded-xl border border-rose-200 bg-rose-50/60 p-4 text-[var(--ink)] sm:grid-cols-2"><legend className="px-1 text-sm font-semibold text-[var(--ink)]">Payment details after rejection</legend><p className="text-sm text-[var(--ink)] sm:col-span-2">Existing amounts and deadlines are preserved. Change them only when the rejection notice explicitly provides updated terms.</p><label className="text-sm font-semibold">Payment status<select className="mt-2 min-h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[var(--ink)]" defaultValue={paymentStatus === "NOT_REQUIRED" ? "PAYMENT_REQUIRED" : paymentStatus} name="paymentStatus">{paymentStatuses.filter((status) => status !== "NOT_REQUIRED").map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label><label className="text-sm font-semibold">Payment deadline<input className="mt-2 min-h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[var(--ink)]" defaultValue={paymentDeadline} name="paymentDeadline" type="date" /></label><label className="text-sm font-semibold">Amount payable<span className="relative mt-2 block"><span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[var(--muted)]">£</span><input className="min-h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] py-2 pl-7 pr-3 text-[var(--ink)]" defaultValue={paymentAmount} inputMode="decimal" min="0" name="paymentAmount" step="0.01" type="number" /></span></label><label className="text-sm font-semibold">Payment reference <span className="font-normal text-[var(--muted)]">(optional)</span><input className="mt-2 min-h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[var(--ink)]" defaultValue={paymentReference} name="paymentReference" /></label></fieldset>}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button className="min-h-11 rounded-lg border border-[var(--line)] px-4 py-2 text-sm font-semibold" onClick={() => setOpen(false)} type="button">Cancel</button><button className="min-h-11 rounded-lg bg-[var(--primary)] px-5 py-2 text-sm font-semibold text-[var(--surface)]" type="submit">Save decision</button></div>
        </form>
      </section>
    </div>}
  </>;
}
