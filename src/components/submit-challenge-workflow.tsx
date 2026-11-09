"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";

import { markChallengeSubmitted, saveIssuerChallengeUrl } from "@/app/actions";
import { validateAppealUrl } from "@/lib/appeal-url";

type Props = {
  pcnId: string;
  pcnReference: string;
  vehicleRegistration: string;
  challengeId?: string;
  challengeText: string;
  issuer: { id: string; name: string; challengeUrl: string | null };
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  }
}

function openPlaceholder(): Window | null {
  const portalWindow = window.open("about:blank", "_blank");
  if (portalWindow) {
    portalWindow.opener = null;
    portalWindow.document.title = "Opening appeal portal…";
  }
  return portalWindow;
}

function londonDateInput(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function SubmitChallengeWorkflow({ pcnId, pcnReference, vehicleRegistration, challengeId, challengeText, issuer }: Props) {
  const [challengeUrl, setChallengeUrl] = useState(issuer.challengeUrl ?? "");
  const [urlInput, setUrlInput] = useState(issuer.challengeUrl ?? "");
  const [dialog, setDialog] = useState<"url" | "confirm" | null>(null);
  const [urlPurpose, setUrlPurpose] = useState<"submit" | "edit">("submit");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [openedUrl, setOpenedUrl] = useState<string | null>(null);
  const firstControl = useRef<HTMLInputElement>(null);
  const today = londonDateInput();

  useEffect(() => {
    if (!dialog) return;
    firstControl.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (dialog === "confirm") setNotice("Challenge remains a draft.");
      setError(null);
      setDialog(null);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [dialog]);

  async function copyAndOpen(url: string, portalWindow: Window | null) {
    const copied = await copyText(challengeText);
    if (portalWindow) portalWindow.location.replace(url);
    setOpenedUrl(url);
    setNotice(copied
      ? "Challenge copied. Paste it into the issuer's appeal form, submit it there, then confirm below."
      : "The appeal portal was opened, but automatic copying was unavailable. Use Copy challenge below before submitting.");
    setError(portalWindow ? null : "Your browser blocked the new tab. Use Open appeal portal below.");
    setDialog("confirm");
  }

  function beginSubmission() {
    setError(null);
    setNotice(null);
    const validation = validateAppealUrl(challengeUrl);
    if (!validation.ok) {
      setUrlPurpose("submit");
      setUrlInput(challengeUrl);
      setError(challengeUrl ? validation.error : null);
      setDialog("url");
      return;
    }
    const portalWindow = openPlaceholder();
    void copyAndOpen(validation.url, portalWindow);
  }

  function editLink() {
    setUrlPurpose("edit");
    setUrlInput(challengeUrl);
    setError(null);
    setNotice(null);
    setDialog("url");
  }

  async function saveLink() {
    const validation = validateAppealUrl(urlInput);
    if (!validation.ok) { setError(validation.error); return; }
    const portalWindow = urlPurpose === "submit" ? openPlaceholder() : null;
    setSaving(true);
    setError(null);
    const result = await saveIssuerChallengeUrl({ pcnId, issuerId: issuer.id, url: validation.url });
    setSaving(false);
    if (!result.ok) {
      portalWindow?.close();
      setError(result.error);
      return;
    }
    setChallengeUrl(result.url);
    setUrlInput(result.url);
    if (urlPurpose === "submit") await copyAndOpen(result.url, portalWindow);
    else {
      setDialog(null);
      setNotice("Appeal link updated.");
    }
  }

  return <>
    <div className="flex flex-wrap items-center gap-3">
      {challengeId && <button className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-[var(--surface)] shadow-sm hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50" disabled={!challengeText.trim()} onClick={beginSubmission} type="button"><ExternalLink className="size-4" />Submit Challenge</button>}
      <button className="min-h-11 rounded-lg px-2 py-2 text-sm font-medium text-[var(--muted)] underline-offset-4 hover:text-[var(--ink)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]" onClick={editLink} type="button">Edit appeal link</button>
      {notice && !dialog && <span className="text-sm text-[var(--primary)]" role="status">{notice}</span>}
    </div>

    {dialog && <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-3 sm:items-center sm:p-6" onMouseDown={(event) => { if (event.currentTarget !== event.target) return; if (dialog === "confirm") setNotice("Challenge remains a draft."); setError(null); setDialog(null); }}>
      <section aria-labelledby="appeal-dialog-title" aria-modal="true" className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-5 text-[var(--ink)] shadow-2xl sm:p-6" role="dialog">
        {dialog === "url" ? <>
          <h2 className="font-serif text-2xl" id="appeal-dialog-title">{urlPurpose === "edit" ? "Edit appeal link" : "Appeal portal not configured"}</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{urlPurpose === "edit" ? `Update the official appeal URL saved for ${issuer.name}.` : <>No appeal link is saved for {issuer.name}. Add the official appeal URL once and we&apos;ll remember it for future PCNs.</>}</p>
          <label className="mt-5 block text-sm font-semibold">Official appeal URL<input autoComplete="url" className="mt-2 min-h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[var(--ink)] shadow-sm outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-soft)]" inputMode="url" onChange={(event) => setUrlInput(event.target.value)} placeholder="https://…" ref={firstControl} type="url" value={urlInput} /></label>
          <p className="mt-2 text-xs text-[var(--muted)]">Use the issuer&apos;s official HTTPS challenge or appeal page.</p>
          {error && <p className="mt-4 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm font-medium text-[var(--ink)]" role="alert">{error}</p>}
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button className="min-h-11 rounded-lg border border-[var(--line)] px-4 py-2 text-sm font-semibold" disabled={saving} onClick={() => { setError(null); setDialog(null); }} type="button">Cancel</button><button className="min-h-11 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--surface)] disabled:opacity-60" disabled={saving} onClick={() => void saveLink()} type="button">{saving ? "Saving…" : urlPurpose === "edit" ? "Save link" : "Save & Continue"}</button></div>
        </> : <>
          <h2 className="font-serif text-2xl" id="appeal-dialog-title">Did you successfully submit this challenge?</h2>
          <div className="mt-4 grid gap-3 rounded-xl border border-[var(--line)] bg-[var(--primary-soft)] p-3 sm:grid-cols-[auto_1fr_1fr] sm:items-center sm:p-4" aria-label="Challenge summary">
            <div className="rounded-lg border border-[var(--primary)]/30 bg-[var(--surface)] px-3 py-2 sm:min-w-32"><span className="block text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">VRM</span><strong className="mt-1 block text-lg font-bold tracking-wide text-[var(--ink)]">{vehicleRegistration}</strong></div>
            <div className="min-w-0"><span className="block text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">PCN number</span><strong className="mt-1 block break-words text-sm text-[var(--ink)]">{pcnReference}</strong></div>
            <div className="min-w-0"><span className="block text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Issuer</span><strong className="mt-1 block break-words text-sm text-[var(--ink)]">{issuer.name}</strong></div>
          </div>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Opening the issuer&apos;s website did not change this draft. Confirm only after the appeal was submitted on the portal.</p>
          {notice && <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-[var(--ink)]" role="status">{notice}</p>}
          {error && <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-[var(--ink)]" role="alert">{error}</p>}
          <div className="mt-4 flex flex-wrap gap-3"><button className="min-h-11 rounded-lg border border-[var(--line)] px-3 py-2 text-sm font-semibold" onClick={() => void copyText(challengeText).then((copied) => setNotice(copied ? "Challenge copied again." : "Copying was unavailable; select the challenge text manually."))} type="button">Copy challenge</button>{openedUrl && <a className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--line)] px-3 py-2 text-sm font-semibold" href={openedUrl} rel="noreferrer" target="_blank">Open appeal portal <ExternalLink className="size-4" /></a>}</div>
          <label className="mt-5 block text-sm font-semibold">Submission date<input className="mt-2 min-h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[var(--ink)]" defaultValue={today} name="submissionDate" ref={firstControl} required type="date" /></label>
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button className="min-h-11 rounded-lg border border-[var(--line)] px-4 py-2 text-sm font-semibold" onClick={() => { setDialog(null); setError(null); setNotice("Challenge remains a draft."); }} type="button">Not yet</button><button className="min-h-11 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--surface)]" formAction={markChallengeSubmitted} type="submit">Yes, record submission</button></div>
        </>}
      </section>
    </div>}
  </>;
}
