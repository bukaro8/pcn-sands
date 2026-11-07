"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { parsePcnJson, pcnPrompt } from "@/lib/chatgpt-import";
import { createPcn } from "@/app/actions";
import { noticeTypes, statusLabel } from "@/lib/pcn";

type Issuer = { id: string; name: string; type: string };
const input = "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
export function ChatGptPcnImport({ issuers }: { issuers: Issuer[] }) {
  const [open, setOpen] = useState(false); const [raw, setRaw] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({}); const [errors, setErrors] = useState<Record<string, string>>({});
  const [match, setMatch] = useState<{ existingPcnId: string | null; sameVehicle: boolean | null; existingVehicle: boolean } | null>(null);
  const [applied, setApplied] = useState(false); const [notice, setNotice] = useState("");
  const openerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLButtonElement>("button")?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { setOpen(false); openerRef.current?.focus(); return; }
      if (event.key !== "Tab" || !dialog) return;
      const controls = [...dialog.querySelectorAll<HTMLElement>('button,a[href],textarea,input,select')].filter((control) => !control.hasAttribute("disabled"));
      if (!controls.length) return;
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0].focus(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);
  async function validate() {
    const result = parsePcnJson(raw); setErrors(result.errors); setMatch(null);
    if (Object.keys(result.errors).length) return;
    const values = Object.fromEntries(Object.entries(result.values).map(([key, value]) => [key, value ?? ""]));
    setFields(values); setApplied(true); setOpen(false); setNotice("JSON validated. Review and correct every field before saving.");
    if (values.reference && values.registration) {
      try { const response = await fetch("/api/pcn-import-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference: values.reference, registration: values.registration }) }); if (response.ok) setMatch(await response.json()); }
      catch { setNotice("Could not check for an existing case. Saving will still check for duplicates."); }
    }
  }
  function change(key: string, value: string) { setFields((old) => ({ ...old, [key]: value })); setMatch(null); }
  return <section className="capture-primary rounded-2xl border border-emerald-700/30 bg-emerald-950 p-5 text-white shadow-lg sm:p-7"><p className="text-xs font-bold uppercase tracking-widest text-emerald-200">Recommended · Step 1</p><h2 className="mt-2 font-serif text-2xl">Import from ChatGPT</h2><p className="mt-2 max-w-2xl text-sm text-emerald-100">Photograph your PCN in ChatGPT, paste its JSON here, then review the details. Nothing is saved until you confirm.</p><button ref={openerRef} className="capture-primary-action mt-4 rounded-lg bg-white px-4 py-2 font-medium text-emerald-950" onClick={() => setOpen(true)} type="button">Open ChatGPT import</button>
  {open && <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 p-3 sm:p-8" role="presentation"><div ref={dialogRef} aria-label="Import PCN from ChatGPT" aria-modal="true" className="mx-auto max-w-2xl rounded-2xl bg-white p-5 text-slate-900 shadow-2xl sm:p-7" role="dialog"><div className="flex justify-between gap-4"><h3 className="font-serif text-2xl">Import a PCN</h3><button onClick={() => { setOpen(false); openerRef.current?.focus(); }} type="button">Close</button></div><p className="mt-3 text-sm">Copy the prompt, open ChatGPT, attach a clear photograph, then paste the JSON response below.</p><textarea aria-label="Reusable PCN extraction prompt" className={input} readOnly rows={7} value={pcnPrompt} /><div className="mt-3 flex flex-wrap gap-3"><button className="rounded-lg bg-emerald-800 px-4 py-2 text-white" onClick={async () => { await navigator.clipboard.writeText(pcnPrompt); setNotice("Prompt copied."); }} type="button">Copy Prompt</button><a className="rounded-lg border px-4 py-2" href="https://chatgpt.com/" rel="noreferrer" target="_blank">Open ChatGPT</a></div><label className="mt-5 block text-sm font-medium">Paste JSON<textarea className={input} onChange={(event) => setRaw(event.target.value)} rows={9} value={raw} /></label>{Object.entries(errors).length > 0 && <ul className="mt-3 rounded-lg border border-rose-300 p-3 text-sm text-rose-800" role="alert">{Object.entries(errors).map(([field, message]) => <li key={field}>{field}: {message}</li>)}</ul>}<button className="mt-4 rounded-lg bg-emerald-800 px-4 py-2 text-white" onClick={() => void validate()} type="button">Validate and review</button></div></div>}
  {notice && <p className="mt-4 text-sm text-emerald-100" role="status">{notice}</p>}
  {applied && <form action={createPcn} className="mt-6 space-y-4 rounded-xl bg-white p-4 text-slate-900 sm:p-6"><h3 className="font-serif text-xl">Review PCN details</h3>{match?.existingPcnId && <p className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm">This reference already exists{match.sameVehicle ? " for this vehicle" : " with a different vehicle"}. <Link className="underline" href={`/pcns/${match.existingPcnId}`}>Open the existing case to record a subsequent notice.</Link></p>}{match?.existingVehicle && !match.existingPcnId && <p className="text-sm text-emerald-800">Existing vehicle found; it will be reused.</p>}<div className="grid gap-4 sm:grid-cols-2">{[["reference","PCN reference"],["registration","Vehicle registration"],["contraventionLocation","Location"],["contraventionDate","Contravention date"],["issueDate","Issue date"],["contraventionCode","Code"],["contraventionDescription","Description"],["contraventionTime","Contravention time"],["paymentDeadline","Explicit payment deadline"],["penaltyAmount","Amount shown (£)"],["notes","Other notice details"]].map(([key,label]) => <label className="text-sm font-medium" key={key}>{label}<input className={input} name={key === "penaltyAmount" ? "paymentAmount" : key} onChange={(event) => change(key,event.target.value)} required={["reference","registration","contraventionLocation","contraventionDate","issueDate"].includes(key)} type={["contraventionDate","issueDate","paymentDeadline"].includes(key) ? "date" : "text"} value={fields[key] ?? ""} /></label>)}<label className="text-sm font-medium">Notice type<select className={input} name="noticeType" onChange={(event) => change("noticeType", event.target.value)} value={fields.noticeType || "ORIGINAL_PCN"}>{noticeTypes.map((v) => <option key={v} value={v}>{statusLabel(v)}</option>)}</select></label><label className="text-sm font-medium">Existing issuer<select className={input} name="issuerId" onChange={(event) => change("issuerId",event.target.value)} value={fields.issuerId ?? ""}><option value="">Create issuer from name below</option>{issuers.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label><label className="text-sm font-medium">Issuer name<input className={input} name="newIssuerName" onChange={(event) => change("issuerName",event.target.value)} value={fields.issuerName ?? ""} /></label><label className="text-sm font-medium">Issuer type<select className={input} name="newIssuerType" onChange={(event) => change("issuerType",event.target.value)} value={fields.issuerType || "COUNCIL"}><option value="COUNCIL">Council</option><option value="PRIVATE">Private parking company</option></select></label></div><input name="challengeStatus" type="hidden" value="AWAITING_CHALLENGE" /><input name="paymentStatus" type="hidden" value="NOT_REQUIRED" /><button className="rounded-lg bg-emerald-800 px-4 py-2 text-white" disabled={Boolean(match?.existingPcnId)} type="submit">Save reviewed PCN</button></form>}</section>;
}
