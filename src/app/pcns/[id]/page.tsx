import Link from "next/link";
import { notFound } from "next/navigation";

import { completeReminder, updateChallenge, updatePcn } from "@/app/actions";
import { ChallengeDraftEditor } from "@/components/challenge-draft-editor";
import { DeletePcnButton } from "@/components/delete-pcn-button";
import { DatabaseFailure } from "@/components/database-failure";
import { PcnForm } from "@/components/pcn-form";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { challengeOutcomes, dateInputValue, formatDate, isOverdue, statusLabel } from "@/lib/pcn";

export const dynamic = "force-dynamic";

const inputClass = "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-600 focus:outline-none";

export default async function PcnDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
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

        <section className="grid gap-4 md:grid-cols-3">
          <Card><CardHeader><CardTitle className="text-sm text-slate-500">Vehicle</CardTitle></CardHeader><CardContent><p className="text-lg font-semibold">{pcn.vehicle.registrationDisplay}</p><p className="mt-2 text-sm text-slate-600">{pcn.issuer.name}</p></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm text-slate-500">Challenge</CardTitle></CardHeader><CardContent><StatusBadge status={pcn.challengeStatus} /><p className="mt-3 text-sm text-slate-600">Issue date: {formatDate(pcn.issueDate)}</p></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm text-slate-500">Payment</CardTitle></CardHeader><CardContent><StatusBadge status={pcn.paymentStatus} /><p className={isOverdue(pcn.paymentStatus, pcn.paymentDeadline) ? "mt-3 text-sm font-medium text-rose-700" : "mt-3 text-sm text-slate-600"}>Deadline: {formatDate(pcn.paymentDeadline)}{isOverdue(pcn.paymentStatus, pcn.paymentDeadline) ? " (overdue)" : ""}</p></CardContent></Card>
        </section>

        <Card>
          <CardHeader><CardTitle>Generate or write a challenge</CardTitle><p className="text-sm text-slate-600">Review, edit and manually submit every challenge. A draft is never submitted automatically.</p></CardHeader>
          <CardContent>
            {drafts.length > 0 ? drafts.map((draft) => <div className="border-b border-slate-200 pb-6 last:border-0 last:pb-0" key={draft.id}><h3 className="mb-4 text-sm font-semibold">{statusLabel(draft.stage)} draft</h3><ChallengeDraftEditor draft={draft} pcnId={pcn.id} /></div>) : <ChallengeDraftEditor pcnId={pcn.id} />}
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
                <button className="mt-4 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50" type="submit">Update challenge</button>
              </form>
            ))}
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
