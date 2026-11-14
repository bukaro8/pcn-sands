"use client";

import { useState } from "react";

import { manuallySendReport } from "@/app/actions";

type Props = {
  reportId: string;
  reportType: "Weekly" | "Monthly";
  managerEmail?: string;
  emailFrom?: string;
  subject: string;
  periodStart: string;
  periodEnd: string;
  attachmentFilename: string;
};

export function ReportEmailConfirmation({ reportId, reportType, managerEmail, emailFrom, subject, periodStart, periodEnd, attachmentFilename }: Props) {
  const [open, setOpen] = useState(false);
  const canSend = Boolean(managerEmail && emailFrom);
  if (!canSend) return <button className="font-medium text-[var(--muted)]" disabled type="button">Send email unavailable</button>;

  return <>
    <button className="font-medium underline" onClick={() => setOpen(true)} type="button">Send email</button>
    {open && <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-3 sm:items-center sm:p-6" onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false); }}>
      <section aria-labelledby={`report-email-title-${reportId}`} aria-modal="true" className="w-full max-w-lg rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-5 text-[var(--ink)] shadow-2xl sm:p-6" role="dialog">
        <h2 className="font-serif text-2xl" id={`report-email-title-${reportId}`}>Confirm {reportType.toLowerCase()} report email</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Review the message details before sending. A fresh report version will be generated from the latest PCN data when you confirm.</p>
        <dl className="mt-5 grid gap-3 rounded-xl border border-[var(--line)] bg-[var(--primary-soft)] p-4 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="font-semibold text-[var(--muted)]">To</dt><dd className="break-words font-medium">{managerEmail}</dd>
          <dt className="font-semibold text-[var(--muted)]">From</dt><dd className="break-words">{emailFrom}</dd>
          <dt className="font-semibold text-[var(--muted)]">Subject</dt><dd className="break-words">{subject}</dd>
          <dt className="font-semibold text-[var(--muted)]">Reporting period</dt><dd>{periodStart} – {periodEnd}</dd>
          <dt className="font-semibold text-[var(--muted)]">Attachment</dt><dd className="break-all">{attachmentFilename}</dd>
        </dl>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button className="min-h-11 rounded-lg border border-[var(--line)] px-4 py-2 text-sm font-semibold" onClick={() => setOpen(false)} type="button">Cancel</button>
          <form action={manuallySendReport}><input name="reportId" type="hidden" value={reportId} /><button className="min-h-11 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--surface)]" type="submit">Confirm &amp; Send</button></form>
        </div>
      </section>
    </div>}
  </>;
}
