import { cn } from "@/lib/utils";
import { statusLabel } from "@/lib/pcn";

const tones: Record<string, string> = {
  AWAITING_CHALLENGE: "bg-amber-100 text-amber-800",
  AWAITING_DECISION: "bg-sky-100 text-sky-800",
  PENDING: "bg-sky-100 text-sky-800",
  ACCEPTED: "bg-emerald-100 text-emerald-800",
  PAID: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-rose-100 text-rose-800",
  PAYMENT_REQUIRED: "bg-rose-100 text-rose-800",
  PAYMENT_UNCONFIRMED: "bg-orange-100 text-orange-800",
  NOT_REQUIRED: "bg-slate-100 text-slate-700",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border border-transparent px-2.5 py-1 text-xs font-semibold", tones[status] ?? "bg-slate-100 text-slate-700", className)}>
      {statusLabel(status)}
    </span>
  );
}
