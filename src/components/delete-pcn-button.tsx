"use client";

import { useRef, useState } from "react";
import { AlertTriangle, Trash2, X } from "lucide-react";

import { deletePcn } from "@/app/actions";

export function DeletePcnButton({ pcnId }: { pcnId: string }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  function showDialog() {
    setOpen(true);
    dialog.current?.showModal();
  }

  function closeDialog() {
    dialog.current?.close();
    setOpen(false);
  }

  return <>
    <button className="inline-flex items-center gap-2 rounded-md border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50" onClick={showDialog} type="button"><Trash2 className="size-4" />Delete PCN</button>
    <dialog aria-labelledby="delete-title" className="confirmation-dialog" onClose={() => setOpen(false)} ref={dialog}>
      {open && <div className="p-6"><div className="flex items-start justify-between gap-4"><span className="flex size-11 items-center justify-center rounded-2xl bg-rose-50 text-rose-700"><AlertTriangle className="size-5" /></span><button aria-label="Close" className="rounded-full p-2 text-slate-500 hover:bg-slate-100" onClick={closeDialog} type="button"><X className="size-4" /></button></div><h2 className="mt-5 text-xl font-semibold" id="delete-title">Delete this PCN?</h2><p className="mt-2 text-sm text-slate-600">Its challenges and reminders will also be deleted. This cannot be undone.</p><div className="mt-6 flex justify-end gap-3"><button className="rounded-xl border px-4 py-2 text-sm font-semibold" onClick={closeDialog} type="button">Keep PCN</button><form action={deletePcn}><input name="pcnId" type="hidden" value={pcnId} /><button className="rounded-xl bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700" type="submit">Delete permanently</button></form></div></div>}
    </dialog>
  </>;
}
