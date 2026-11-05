"use client";

import { deletePcn } from "@/app/actions";

export function DeletePcnButton({ pcnId }: { pcnId: string }) {
  return (
    <form
      action={deletePcn}
      onSubmit={(event) => {
        if (!window.confirm("Delete this PCN and its challenges and reminders? This cannot be undone.")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="pcnId" value={pcnId} />
      <button className="rounded-md border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50" type="submit">
        Delete PCN
      </button>
    </form>
  );
}
