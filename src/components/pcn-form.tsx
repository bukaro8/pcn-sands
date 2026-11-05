import Link from "next/link";

import { challengeStatuses, dateInputValue, noticeTypes, paymentStatuses, statusLabel } from "@/lib/pcn";

type IssuerOption = { id: string; name: string; type: string };

type PcnValues = {
  id: string;
  reference: string;
  contraventionCode: string | null;
  contraventionLocation: string;
  contraventionDate: Date;
  issueDate: Date;
  noticeType: string;
  challengeStatus: string;
  paymentStatus: string;
  paymentDeadline: Date | null;
  paymentReference: string | null;
  notes: string | null;
  vehicle: { registrationDisplay: string };
  issuer: { id: string };
};

const inputClass = "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-600 focus:outline-none";
const labelClass = "block text-sm font-medium text-slate-700";

export function PcnForm({ action, issuers, pcn, error }: { action: (formData: FormData) => void | Promise<void>; issuers: IssuerOption[]; pcn?: PcnValues; error?: string }) {
  return <form action={action} className="space-y-7">
    {pcn && <input name="pcnId" type="hidden" value={pcn.id} />}
    {error && <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">{error}</p>}
    <fieldset className="grid gap-5 md:grid-cols-2"><legend className="mb-3 text-base font-semibold">PCN details</legend><label className={labelClass}>PCN reference<input className={inputClass} defaultValue={pcn?.reference} maxLength={80} name="reference" required /></label><label className={labelClass}>Vehicle registration<input className={inputClass} defaultValue={pcn?.vehicle.registrationDisplay} name="registration" required /></label><label className={labelClass}>Contravention location<input className={inputClass} defaultValue={pcn?.contraventionLocation} maxLength={300} name="contraventionLocation" required /></label><label className={labelClass}>Contravention code<input className={inputClass} defaultValue={pcn?.contraventionCode ?? ""} name="contraventionCode" /></label><label className={labelClass}>Contravention date<input className={inputClass} defaultValue={dateInputValue(pcn?.contraventionDate)} name="contraventionDate" required type="date" /></label><label className={labelClass}>Issue date<input className={inputClass} defaultValue={dateInputValue(pcn?.issueDate)} name="issueDate" required type="date" /></label><label className={labelClass}>Notice type<select className={inputClass} defaultValue={pcn?.noticeType ?? "ORIGINAL_PCN"} name="noticeType">{noticeTypes.map((type) => <option key={type} value={type}>{statusLabel(type)}</option>)}</select></label><label className={labelClass}>Challenge status<select className={inputClass} defaultValue={pcn?.challengeStatus ?? "AWAITING_CHALLENGE"} name="challengeStatus">{challengeStatuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label></fieldset>
    <fieldset className="grid gap-5 border-t border-slate-200 pt-6 md:grid-cols-2"><legend className="mb-3 text-base font-semibold">Issuer</legend><label className={labelClass}>Existing issuer<select className={inputClass} defaultValue={pcn?.issuer.id ?? ""} name="issuerId"><option value="">Create or choose a new issuer below</option>{issuers.map((issuer) => <option key={issuer.id} value={issuer.id}>{issuer.name} ({issuer.type.toLowerCase()})</option>)}</select></label><div className="hidden md:block" /><label className={labelClass}>New issuer name<input className={inputClass} maxLength={160} name="newIssuerName" /></label><label className={labelClass}>New issuer type<select className={inputClass} defaultValue="COUNCIL" name="newIssuerType"><option value="COUNCIL">Council</option><option value="PRIVATE">Private parking company</option></select></label><label className={labelClass}>Official challenge URL (optional)<input className={inputClass} name="newIssuerChallengeUrl" type="url" /></label></fieldset>
    <fieldset className="grid gap-5 border-t border-slate-200 pt-6 md:grid-cols-2"><legend className="mb-3 text-base font-semibold">Payment and notes</legend><label className={labelClass}>Payment status<select className={inputClass} defaultValue={pcn?.paymentStatus ?? "NOT_REQUIRED"} name="paymentStatus">{paymentStatuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label><label className={labelClass}>Payment deadline<input className={inputClass} defaultValue={dateInputValue(pcn?.paymentDeadline)} name="paymentDeadline" type="date" /></label><label className={labelClass}>Payment reference (optional)<input className={inputClass} defaultValue={pcn?.paymentReference ?? ""} name="paymentReference" /></label><label className={`${labelClass} md:col-span-2`}>Notes<textarea className={inputClass} defaultValue={pcn?.notes ?? ""} name="notes" rows={4} /></label></fieldset>
    <div className="flex flex-wrap gap-3"><button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700" type="submit">{pcn ? "Save changes" : "Create PCN"}</button><Link className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" href={pcn ? `/pcns/${pcn.id}` : "/pcns"}>Cancel</Link></div>
  </form>;
}
