import Link from "next/link";
import { notFound } from "next/navigation";
import { PartyPopper } from "lucide-react";

import { completeReminder, recordSubsequentNotice, updateChallenge, updatePcn } from "@/app/actions";
import { ChallengeDraftEditor } from "@/components/challenge-draft-editor";
import { InvoiceImport } from "@/components/invoice-import";
import { DeletePcnButton } from "@/components/delete-pcn-button";
import { DatabaseFailure } from "@/components/database-failure";
import { PcnForm } from "@/components/pcn-form";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { challengeOutcomes, dateInputValue, formatDate, isOverdue, noticeTypes, paymentStatuses, statusLabel } from "@/lib/pcn";

export const dynamic = "force-dynamic";

const inputClass = "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-600 focus:outline-none";

export default async function PcnDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; message?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  let result;
  try {
    const { prisma } = await import("@/lib/prisma");
    result = await Promise.all([
    prisma.pcn.findUnique({
      where: { id },
      include: {
        vehicle: true,
        issuer: true,
        challenges: { orderBy: { createdAt: "desc" } },
        reminders: { orderBy: { dueAt: "asc" } },
        subsequentNotices: { orderBy: { receivedDate: "desc" } },
        invoiceEvidence: true,
      },
    }),
    prisma.issuer.findMany({ select: { id: true, name: true, type: true }, orderBy: { name: "asc" } }),
    ]);
  } catch (error) {
    return <DatabaseFailure error={error} operation="PCN detail load" retryPath={`/pcns/${id}`} />;
  }
  const [pcn, issuers] = result;

  if (!pcn) notFound();

  const drafts = pcn.challenges.filter((challenge) => !challenge.submissionDate);
  const submittedChallenges = pcn.challenges.filter((challenge) => challenge.submissionDate);
  const challengeFacts = { reference: pcn.reference, registration: pcn.vehicle.registrationDisplay, issuer: pcn.issuer.name, issuerType: pcn.issuer.type, location: pcn.contraventionLocation, code: pcn.contraventionCode, contraventionDate: dateInputValue(pcn.contraventionDate), issueDate: dateInputValue(pcn.issueDate), noticeType: pcn.noticeType, invoice: pcn.invoiceEvidence ? { reference: pcn.invoiceEvidence.reference, invoiceDate: dateInputValue(pcn.invoiceEvidence.invoiceDate), deliveryDate: dateInputValue(pcn.invoiceEvidence.deliveryDate), deliveryAddress: pcn.invoiceEvidence.deliveryAddress, billingAddress: pcn.invoiceEvidence.billingAddress, recipient: pcn.invoiceEvidence.recipient, supplier: pcn.invoiceEvidence.supplier, description: pcn.invoiceEvidence.description, deliveryTime: pcn.invoiceEvidence.deliveryTime, otherFacts: pcn.invoiceEvidence.otherFacts } : null };
  const lifecycleLabel = drafts.length && pcn.challengeStatus === "AWAITING_CHALLENGE" ? "Challenge drafted" : statusLabel(pcn.challengeStatus);

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">
          <div>
            <Link className="text-sm text-slate-600 underline" href="/pcns">PCNs</Link>
            <h1 className="mt-1 text-xl font-semibold">{pcn.reference}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {pcn.issuer.challengeUrl && <a className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50" href={pcn.issuer.challengeUrl} rel="noreferrer" target="_blank">Open appeal portal</a>}
            <DeletePcnButton pcnId={pcn.id} />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        {query.error && <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">{query.error}</p>}
        {query.message && <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{query.message}</p>}
        {pcn.challengeStatus === "ACCEPTED" && <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800" role="status"><span className="flex size-10 items-center justify-center rounded-full bg-emerald-100"><PartyPopper className="size-5" /></span><div><strong>Challenge accepted — lovely news!</strong><p className="mt-1 text-sm">This PCN has been recorded as accepted.</p></div></div>}

        <section className="grid gap-4 md:grid-cols-3">
          <Card><CardHeader><CardTitle className="text-sm text-slate-500">Vehicle</CardTitle></CardHeader><CardContent><p className="text-lg font-semibold">{pcn.vehicle.registrationDisplay}</p><p className="mt-2 text-sm text-slate-600">{pcn.issuer.name}</p></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm text-slate-500">Lifecycle</CardTitle></CardHeader><CardContent><StatusBadge status={pcn.challengeStatus} />{lifecycleLabel !== statusLabel(pcn.challengeStatus) && <p className="mt-2 text-sm font-medium text-amber-800">{lifecycleLabel}</p>}<p className="mt-3 text-sm text-slate-600">Issue date: {formatDate(pcn.issueDate)}</p></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm text-slate-500">Payment</CardTitle></CardHeader><CardContent><StatusBadge status={pcn.paymentStatus} /><p className="mt-3 text-sm text-slate-600">Amount: {pcn.paymentAmountPence == null ? "Not recorded" : new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pcn.paymentAmountPence / 100)}</p><p className={isOverdue(pcn.paymentStatus, pcn.paymentDeadline) ? "mt-1 text-sm font-medium text-rose-700" : "mt-1 text-sm text-slate-600"}>Deadline: {formatDate(pcn.paymentDeadline)}{isOverdue(pcn.paymentStatus, pcn.paymentDeadline) ? " (overdue)" : ""}</p></CardContent></Card>
        </section>

        <InvoiceImport pcnId={pcn.id} evidence={pcn.invoiceEvidence ? { reference: pcn.invoiceEvidence.reference, invoiceDate: dateInputValue(pcn.invoiceEvidence.invoiceDate), deliveryDate: dateInputValue(pcn.invoiceEvidence.deliveryDate), deliveryAddress: pcn.invoiceEvidence.deliveryAddress, billingAddress: pcn.invoiceEvidence.billingAddress, recipient: pcn.invoiceEvidence.recipient, supplier: pcn.invoiceEvidence.supplier, description: pcn.invoiceEvidence.description, deliveryTime: pcn.invoiceEvidence.deliveryTime, otherFacts: pcn.invoiceEvidence.otherFacts } : null} />
        <Card>
          <CardHeader><CardTitle>Generate or write a challenge</CardTitle><p className="text-sm text-slate-600">Review, edit and manually submit every challenge. A draft is never submitted automatically.</p></CardHeader>
          <CardContent>
            {drafts.length > 0 ? drafts.map((draft) => <div className="border-b border-slate-200 pb-6 last:border-0 last:pb-0" key={draft.id}><h3 className="mb-4 text-sm font-semibold">{statusLabel(draft.stage)} draft</h3><ChallengeDraftEditor draft={draft} facts={challengeFacts} pcnId={pcn.id} /></div>) : <ChallengeDraftEditor facts={challengeFacts} pcnId={pcn.id} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Challenge history</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            {submittedChallenges.length === 0 ? <p className="text-sm text-slate-600">No challenge has been marked as submitted yet.</p> : submittedChallenges.map((challenge) => (
              <form action={updateChallenge} className="rounded-lg border border-slate-200 p-4" key={challenge.id}>
                <input name="pcnId" type="hidden" value={pcn.id} />
                <input name="challengeId" type="hidden" value={challenge.id} />
                <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium">{statusLabel(challenge.stage)}</p><p className="text-sm text-slate-600">Submitted {formatDate(challenge.submissionDate)}</p></div><StatusBadge status={challenge.outcome} /></div>
                {challenge.challengeText && <p className="mt-3 whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-sm text-slate-700">{challenge.challengeText}</p>}
                <div className="mt-4 grid gap-4 sm:grid-cols-3"><label className="text-sm font-medium">Outcome<select className={inputClass} defaultValue={challenge.outcome} name="outcome">{challengeOutcomes.map((outcome) => <option key={outcome} value={outcome}>{statusLabel(outcome)}</option>)}</select></label><label className="text-sm font-medium">Decision date<input className={inputClass} defaultValue={dateInputValue(challenge.decisionDate)} name="decisionDate" type="date" /></label><label className="text-sm font-medium">Status-check date<input className={inputClass} defaultValue={dateInputValue(challenge.nextStatusCheckDate)} name="nextStatusCheckDate" type="date" /></label></div>
                <fieldset className="mt-5 grid gap-4 rounded-xl border border-rose-100 bg-rose-50/40 p-4 sm:grid-cols-2"><legend className="px-1 text-sm font-semibold text-rose-900">If the challenge was rejected</legend><p className="sm:col-span-2 text-sm text-rose-900">Record the actual amount and deadline shown on the notice. Management receives the Friday report and a reminder two days before a recorded deadline.</p><label className="text-sm font-medium">Payment status<select className={inputClass} defaultValue={pcn.paymentStatus === "NOT_REQUIRED" ? "PAYMENT_REQUIRED" : pcn.paymentStatus} name="paymentStatus">{paymentStatuses.filter((status) => status !== "NOT_REQUIRED").map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label><label className="text-sm font-medium">Payment deadline<input className={inputClass} defaultValue={dateInputValue(pcn.paymentDeadline)} name="paymentDeadline" type="date" /></label><label className="text-sm font-medium">Amount payable<span className="relative mt-1 block"><span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500">£</span><input className={`${inputClass} mt-0 pl-7`} defaultValue={pcn.paymentAmountPence == null ? "" : (pcn.paymentAmountPence / 100).toFixed(2)} inputMode="decimal" min="0" name="paymentAmount" placeholder="0.00" step="0.01" type="number" /></span></label><label className="text-sm font-medium">Payment reference (optional)<input className={inputClass} defaultValue={pcn.paymentReference ?? ""} name="paymentReference" /></label></fieldset>
                <button className="mt-4 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50" type="submit">Record decision</button>
              </form>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Subsequent notices</CardTitle><p className="text-sm text-slate-600">Record a further notice against this existing case. It does not reopen a rejected challenge or create another appeal.</p></CardHeader>
          <CardContent className="space-y-5">
            {pcn.subsequentNotices.length > 0 && <ul className="space-y-3">{pcn.subsequentNotices.map((notice) => <li className="rounded-lg border border-slate-200 p-3" key={notice.id}><div className="flex flex-wrap items-center justify-between gap-2"><strong>{statusLabel(notice.noticeType)}</strong><span className="text-sm text-slate-600">Received {formatDate(notice.receivedDate)}</span></div><p className="mt-2 text-sm text-slate-600">{notice.hasNewInformation ? "New information recorded for administrator review." : "No new evidence or information recorded; the existing outcome is unchanged."}</p>{notice.evidenceDetails && <p className="mt-2 whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-sm text-slate-700">{notice.evidenceDetails}</p>}</li>)}</ul>}
            <form action={recordSubsequentNotice} className="grid gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-2"><input name="pcnId" type="hidden" value={pcn.id} /><input name="pcnReference" type="hidden" value={pcn.reference} /><input name="registration" type="hidden" value={pcn.vehicle.registrationDisplay} /><label className="text-sm font-medium">Notice type<select className={inputClass} defaultValue="NOTICE_TO_OWNER" name="noticeType">{noticeTypes.map((type) => <option key={type} value={type}>{statusLabel(type)}</option>)}</select></label><label className="text-sm font-medium">Received date<input className={inputClass} name="receivedDate" required type="date" /></label><fieldset className="sm:col-span-2"><legend className="text-sm font-medium">Does this notice contain new evidence or information that changes the case?</legend><div className="mt-2 flex gap-4 text-sm"><label><input className="mr-2" name="hasNewInformation" type="radio" value="no" defaultChecked />No</label><label><input className="mr-2" name="hasNewInformation" type="radio" value="yes" />Yes — flag for review</label></div></fieldset><label className="sm:col-span-2 text-sm font-medium">Additional evidence or information (optional)<textarea className={inputClass} maxLength={3000} name="evidenceDetails" rows={3} /></label><p className="sm:col-span-2 text-sm text-slate-600">A “yes” creates a single review task. It never submits a further challenge or changes deadlines.</p><button className="w-fit rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50" type="submit">Record subsequent notice</button></form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Reminders</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {pcn.reminders.length === 0 ? <p className="text-sm text-slate-600">No reminders are scheduled.</p> : pcn.reminders.map((reminder) => <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3" key={reminder.id}><div><p className="font-medium">{statusLabel(reminder.type)}</p><p className="text-sm text-slate-600">Due {formatDate(reminder.dueAt)}</p></div><div className="flex items-center gap-3"><StatusBadge status={reminder.status} />{reminder.status !== "COMPLETED" && <form action={completeReminder}><input name="reminderId" type="hidden" value={reminder.id} /><input name="pcnId" type="hidden" value={pcn.id} /><button className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50" type="submit">Mark completed</button></form>}</div></div>)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Edit PCN</CardTitle></CardHeader>
          <CardContent><PcnForm action={updatePcn} issuers={issuers} pcn={pcn} /></CardContent>
        </Card>
      </div>
    </main>
  );
}
