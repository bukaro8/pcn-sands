"use client";

import { useState } from "react";

import { saveChallengeDraft } from "@/app/actions";
import { readChallengeGenerationResponse, type ChallengeGeneration } from "@/lib/challenge-generation";
import { challengeStages, dateInputValue, statusLabel } from "@/lib/pcn";
import type { DeliveryEvidenceAnalysis } from "@/lib/delivery-evidence";
import { buildChatGptChallengePrompt } from "@/lib/challenge-writing";
import { SubmitChallengeWorkflow } from "@/components/submit-challenge-workflow";

type Draft = { id?: string; stage?: string; challengeText?: string | null; expectedResponseDate?: Date | null; nextStatusCheckDate?: Date | null };
const inputClass = "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-600 focus:outline-none";

export function ChallengeDraftEditor({ pcnId, draft = {}, facts, evidenceAnalysis, issuer }: { pcnId: string; draft?: Draft; facts?: Record<string, unknown>; evidenceAnalysis?: DeliveryEvidenceAnalysis; issuer: { id: string; name: string; challengeUrl: string | null } }) {
  const [text, setText] = useState(draft.challengeText ?? "");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState<ChallengeGeneration | null>(null);
  const [copied, setCopied] = useState(false);
  function fallbackPrompt(form: HTMLFormElement) { const data = new FormData(form); return buildChatGptChallengePrompt({ stage: String(data.get("stage")), reason: String(data.get("reason")), additionalCircumstances: String(data.get("additionalCircumstances") || ""), facts: facts ?? {} }); }

  async function generate(form: HTMLFormElement) {
    setGenerating(true); setError(null);
    const data = new FormData(form);
    const evidence = form.querySelector<HTMLInputElement>("input[data-evidence]")?.files?.[0];
    if (evidence) data.append("evidence", evidence);
    try {
      const response = await fetch("/api/challenge-generation", { method: "POST", body: data });
      const result = await readChallengeGenerationResponse(response);
      setGeneration(result); setText(result.challengeText);
    } catch (generationError) { setError(generationError instanceof Error ? generationError.message : "Challenge generation failed."); }
    finally { setGenerating(false); }
  }

  return <form className="space-y-4">
    <input name="pcnId" type="hidden" value={pcnId} />
    {draft.id && <input name="challengeId" type="hidden" value={draft.id} />}
    <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Challenge stage<select className={inputClass} defaultValue={draft.stage ?? "INITIAL"} name="stage">{challengeStages.filter((stage) => stage !== "INDEPENDENT").map((stage) => <option key={stage} value={stage}>{statusLabel(stage)}</option>)}</select></label><label className="text-sm font-medium">Reason<select className={inputClass} defaultValue="LOADING_UNLOADING" name="reason"><option value="LOADING_UNLOADING">Loading / unloading</option><option value="PARKING_RESTRICTION_SIGNAGE">Parking restriction or signage</option><option value="OTHER_CIRCUMSTANCES">Other circumstances</option></select></label><label className="text-sm font-medium">Evidence<select className={inputClass} defaultValue="DELIVERY_INVOICE" name="evidenceOption"><option value="DELIVERY_INVOICE">Delivery invoice</option><option value="OTHER_SUPPORTING_EVIDENCE">Other supporting evidence</option><option value="NO_ADDITIONAL_EVIDENCE">No additional evidence</option></select></label><label className="text-sm font-medium">Evidence file (optional)<input className={inputClass} accept="image/jpeg,image/png,image/webp,application/pdf" data-evidence type="file" /></label></div>
    <label className="block text-sm font-medium">Additional circumstances (optional)<textarea className={inputClass} name="additionalCircumstances" rows={3} /></label>
    {facts && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"><div className="flex flex-wrap items-center justify-between gap-2"><strong>Private evidence review</strong><span className="rounded-full bg-white/80 px-2 py-1 text-xs font-medium">Not included verbatim in the challenge</span></div>{evidenceAnalysis && <div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="rounded-lg bg-white/70 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Location relationship</p><p className="mt-1 font-semibold">{evidenceAnalysis.location.label}</p><p className="mt-1 text-emerald-900/80">{evidenceAnalysis.location.detail}</p></div><div className="rounded-lg bg-white/70 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Time relationship</p><p className="mt-1 font-semibold">{evidenceAnalysis.time.label}</p><p className="mt-1 text-emerald-900/80">{evidenceAnalysis.time.detail}</p></div>{evidenceAnalysis.missingFacts.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950 sm:col-span-2"><p className="font-semibold">Confirm before asserting</p><ul className="mt-1 list-disc space-y-1 pl-5">{evidenceAnalysis.missingFacts.map((fact) => <li key={fact}>{fact}</li>)}</ul></div>}</div>}<details className="mt-3"><summary className="cursor-pointer font-medium">View verified PCN and invoice facts</summary><pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-white/70 p-3 text-xs">{JSON.stringify(facts, null, 2)}</pre></details></div>}
    <div className="flex flex-wrap gap-3"><button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60" disabled={generating} onClick={(event) => { if (event.currentTarget.form) void generate(event.currentTarget.form); }} type="button">{generating ? "Generating…" : text ? "Regenerate challenge" : "Generate challenge"}</button><button className="rounded-md border px-4 py-2 text-sm" onClick={async(event)=>{if(event.currentTarget.form){await navigator.clipboard.writeText(fallbackPrompt(event.currentTarget.form));setCopied(true);}}} type="button">Copy Challenge Prompt</button><a className="rounded-md border px-4 py-2 text-sm" href="https://chatgpt.com/" target="_blank" rel="noreferrer">Open ChatGPT</a></div>{copied && <p role="status" className="text-sm text-emerald-700">Prompt copied. Paste the generated letter into the challenge text below, review, then save draft.</p>}
    {error && <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">{error}</p>}
    {generation && <div className="rounded-md bg-slate-100 p-3 text-sm"><p className="font-medium">Evidence review</p><p className="mt-1 text-slate-700">{[generation.evidence.deliveryAddress, generation.evidence.deliveryDate, generation.evidence.companyOrRecipient, generation.evidence.reference].filter(Boolean).join(" · ") || "No relevant evidence facts identified."}</p>{generation.missingInformation.length > 0 && <p className="mt-2 text-amber-800">Missing information: {generation.missingInformation.join("; ")}</p>}</div>}
    <label className="block text-sm font-medium">Challenge text<textarea className={inputClass} name="challengeText" onChange={(event) => setText(event.target.value)} placeholder="Write the challenge manually or generate a draft above." required rows={12} value={text} /></label>
    <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Expected response date<input className={inputClass} defaultValue={dateInputValue(draft.expectedResponseDate)} name="expectedResponseDate" type="date" /></label><label className="text-sm font-medium">Status-check date<input className={inputClass} defaultValue={dateInputValue(draft.nextStatusCheckDate)} name="nextStatusCheckDate" type="date" /></label></div>
    <div className="flex flex-wrap items-center gap-3"><button formAction={saveChallengeDraft} className="min-h-11 rounded-lg border border-[var(--line)] px-4 py-2 text-sm font-semibold" type="submit">Save draft</button><SubmitChallengeWorkflow challengeId={draft.id} challengeText={text} issuer={issuer} pcnId={pcnId} /></div>
  </form>;
}
