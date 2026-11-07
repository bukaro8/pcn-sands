"use client";

import Link from "next/link";
import { useState } from "react";

import { createPcn } from "@/app/actions";
import { calculateInclusiveDeadline, isDiscountExpired } from "@/lib/chatgpt-import";
import { noticeTypes, statusLabel } from "@/lib/pcn";
import type { ExtractedPcn } from "@/lib/pcn-extraction";

type Issuer = { id: string; name: string; type: string };
type Fields = Record<Exclude<keyof ExtractedPcn, "amounts">, string>;

const blankFields: Fields = { reference: "", registration: "", issuerName: "", contraventionCode: "", contraventionLocation: "", contraventionDate: "", issueDate: "", noticeType: "ORIGINAL_PCN", paymentDeadline: "", discountedAmount: "", fullPenaltyAmount: "", discountDeadline: "", fullPaymentDeadline: "", discountPeriodDays: "", discountPeriodStartDate: "" };
const inputClass = "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-600 focus:outline-none";

export function PcnCaptureForm({ issuers }: { issuers: Issuer[] }) {
  const [fields, setFields] = useState<Fields>(blankFields);
  const [amounts, setAmounts] = useState<string[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issuerId, setIssuerId] = useState("");

  function setField(name: keyof Fields, fieldValue: string) {
    setFields((current) => {
      const next = { ...current, [name]: fieldValue };
      if (name === "discountPeriodStartDate" || name === "discountPeriodDays") next.discountDeadline = calculateInclusiveDeadline(next.discountPeriodStartDate, next.discountPeriodDays) ?? "";
      return next;
    });
  }

  async function prepareFile(file: File): Promise<File> {
    if (file.size <= 2 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type) || !("createImageBitmap" in window)) return file;
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
      bitmap.close();
      return blob ? new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" }) : file;
    } catch { return file; }
  }

  async function extract(file: File) {
    setError(null); setProcessing(true); setProgress(0);
    const prepared = await prepareFile(file);
    const data = new FormData(); data.append("document", prepared);
    const request = new XMLHttpRequest();
    request.open("POST", "/api/pcn-extraction");
    request.upload.onprogress = (event) => { if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100)); };
    request.onerror = () => { setError("The document could not be uploaded. You can continue with manual entry."); setProcessing(false); };
    request.onload = () => {
      setProcessing(false); setProgress(null);
      let result: { extraction?: ExtractedPcn; error?: string } = {};
      try { result = JSON.parse(request.responseText) as { extraction?: ExtractedPcn; error?: string }; } catch { setError("The extraction response was invalid. You can continue with manual entry."); return; }
      if (request.status < 200 || request.status >= 300 || !result.extraction) { setError(result.error ?? "Extraction failed. You can continue with manual entry."); return; }
      const extraction = result.extraction;
      setFields({ reference: extraction.reference ?? "", registration: extraction.registration ?? "", issuerName: extraction.issuerName ?? "", contraventionCode: extraction.contraventionCode ?? "", contraventionLocation: extraction.contraventionLocation ?? "", contraventionDate: extraction.contraventionDate ?? "", issueDate: extraction.issueDate ?? "", noticeType: extraction.noticeType ?? "ORIGINAL_PCN", paymentDeadline: extraction.paymentDeadline ?? "", discountedAmount: extraction.discountedAmount ?? "", fullPenaltyAmount: extraction.fullPenaltyAmount ?? "", discountDeadline: extraction.discountDeadline ?? "", fullPaymentDeadline: extraction.fullPaymentDeadline ?? "", discountPeriodDays: extraction.discountPeriodDays ?? "", discountPeriodStartDate: extraction.discountPeriodStartDate ?? "" });
      setAmounts(extraction.amounts);
    };
    request.send(data);
  }

  return <div className="space-y-7"><section className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5"><h2 className="font-semibold">Capture or upload a PCN</h2><p className="mt-1 text-sm text-slate-600">Photographs and documents are processed temporarily and are never stored by this application.</p><label className="mt-4 inline-flex cursor-pointer rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">Choose document<input accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf" capture="environment" className="sr-only" disabled={processing} onChange={(event) => { const file = event.target.files?.[0]; if (file) void extract(file); }} type="file" /></label>{progress !== null && <div className="mt-4"><progress className="w-full" max="100" value={progress} /><p className="mt-1 text-sm text-slate-600">Uploading {progress}%{processing && progress === 100 ? " — extracting details…" : ""}</p></div>}{processing && progress === null && <p className="mt-3 text-sm text-slate-600">Preparing photograph…</p>}{error && <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">{error}</p>}</section><form action={createPcn} className="space-y-6"><section className="grid gap-4 md:grid-cols-2"><h2 className="md:col-span-2 text-lg font-semibold">Review extracted information</h2><label className="text-sm font-medium">PCN reference<input className={inputClass} name="reference" onChange={(event) => setField("reference", event.target.value)} required value={fields.reference} /></label><label className="text-sm font-medium">Vehicle registration<input className={inputClass} name="registration" onChange={(event) => setField("registration", event.target.value)} required value={fields.registration} /></label><label className="text-sm font-medium">Location or street<input className={inputClass} name="contraventionLocation" onChange={(event) => setField("contraventionLocation", event.target.value)} required value={fields.contraventionLocation} /></label><label className="text-sm font-medium">Contravention code<input className={inputClass} name="contraventionCode" onChange={(event) => setField("contraventionCode", event.target.value)} value={fields.contraventionCode} /></label><label className="text-sm font-medium">Contravention date<input className={inputClass} name="contraventionDate" onChange={(event) => setField("contraventionDate", event.target.value)} required type="date" value={fields.contraventionDate} /></label><label className="text-sm font-medium">Issue date<input className={inputClass} name="issueDate" onChange={(event) => setField("issueDate", event.target.value)} required type="date" value={fields.issueDate} /></label><label className="text-sm font-medium">Notice type<select className={inputClass} name="noticeType" onChange={(event) => setField("noticeType", event.target.value)} value={fields.noticeType}>{noticeTypes.map((type) => <option key={type} value={type}>{statusLabel(type)}</option>)}</select></label></section><section className="grid gap-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 md:grid-cols-2"><h2 className="md:col-span-2 text-lg font-semibold">Payment terms shown</h2><label className="text-sm font-semibold">Discounted amount (£)<input className={inputClass} name="discountedAmount" onChange={(event) => setField("discountedAmount", event.target.value)} value={fields.discountedAmount} /></label><label className="text-sm font-semibold">Discount deadline<input className={inputClass} name="discountDeadline" onChange={(event) => setField("discountDeadline", event.target.value)} type="date" value={fields.discountDeadline} /></label>{isDiscountExpired(fields.discountDeadline) && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900 md:col-span-2">This discount deadline has passed. Check whether the reduced amount remains available.</p>}<label className="text-sm font-medium">Full penalty amount (£)<input className={inputClass} name="fullPenaltyAmount" onChange={(event) => setField("fullPenaltyAmount", event.target.value)} value={fields.fullPenaltyAmount} /></label><label className="text-sm font-medium">Full-payment deadline<input className={inputClass} name="fullPaymentDeadline" onChange={(event) => setField("fullPaymentDeadline", event.target.value)} type="date" value={fields.fullPaymentDeadline} /></label><label className="text-sm font-medium">Discount period starts<input className={inputClass} name="discountPeriodStartDate" onChange={(event) => setField("discountPeriodStartDate", event.target.value)} type="date" value={fields.discountPeriodStartDate} /></label><label className="text-sm font-medium">Inclusive discount days<input className={inputClass} max="366" min="1" name="discountPeriodDays" onChange={(event) => setField("discountPeriodDays", event.target.value)} type="number" value={fields.discountPeriodDays} /></label></section>{amounts.length > 0 && <p className="rounded-md bg-slate-100 p-3 text-sm">Amounts visible on the document: {amounts.join(", ")}</p>}<section className="grid gap-4 border-t pt-6 md:grid-cols-2"><h2 className="md:col-span-2 text-lg font-semibold">Issuer</h2><label className="text-sm font-medium">Existing issuer<select className={inputClass} name="issuerId" onChange={(event) => setIssuerId(event.target.value)} value={issuerId}><option value="">Create or choose below</option>{issuers.map((issuer) => <option key={issuer.id} value={issuer.id}>{issuer.name}</option>)}</select></label><label className="text-sm font-medium">New issuer name<input className={inputClass} name="newIssuerName" onChange={(event) => setField("issuerName", event.target.value)} value={fields.issuerName} /></label><label className="text-sm font-medium">New issuer type<select className={inputClass} defaultValue="COUNCIL" name="newIssuerType"><option value="COUNCIL">Council</option><option value="PRIVATE">Private parking company</option></select></label><label className="text-sm font-medium">Official challenge URL (optional)<input className={inputClass} name="newIssuerChallengeUrl" type="url" /></label></section><input name="paymentAmount" type="hidden" value={fields.discountedAmount || fields.fullPenaltyAmount} /><input name="paymentDeadline" type="hidden" value={fields.discountDeadline || fields.fullPaymentDeadline || fields.paymentDeadline} /><input name="challengeStatus" type="hidden" value="AWAITING_CHALLENGE" /><input name="paymentStatus" type="hidden" value="NOT_REQUIRED" /><input name="paymentReference" type="hidden" value="" /><textarea className="sr-only" name="notes" value="" readOnly /><div className="flex flex-wrap gap-3"><button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white" type="submit">Save reviewed PCN</button><Link className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium" href="/pcns/new">Manual entry instead</Link></div></form></div>;
}
