export const challengeStatuses = [
  "AWAITING_CHALLENGE",
  "AWAITING_DECISION",
  "ACCEPTED",
  "REJECTED",
] as const;

export const paymentStatuses = ["NOT_REQUIRED", "PAYMENT_REQUIRED", "PAYMENT_UNCONFIRMED", "PAID"] as const;

export const noticeTypes = ["ORIGINAL_PCN", "NOTICE_TO_OWNER", "PRIVATE_PARKING_NOTICE", "OTHER"] as const;

export const challengeStages = ["INITIAL", "FORMAL", "INDEPENDENT"] as const;

export const challengeOutcomes = ["PENDING", "ACCEPTED", "REJECTED"] as const;

const labels: Record<string, string> = {
  AWAITING_CHALLENGE: "Awaiting challenge",
  AWAITING_DECISION: "Awaiting decision",
  NOT_REQUIRED: "Not required",
  PAYMENT_REQUIRED: "Payment required",
  PAYMENT_UNCONFIRMED: "Payment unconfirmed",
  ORIGINAL_PCN: "Original PCN",
  NOTICE_TO_OWNER: "Notice to Owner",
  PRIVATE_PARKING_NOTICE: "Private parking notice",
  CHALLENGE_STATUS_CHECK: "Challenge status check",
};

export function statusLabel(status: string): string {
  return labels[status] ?? status.charAt(0) + status.slice(1).toLowerCase().replaceAll("_", " ");
}

export function formatDate(date: Date | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

export function dateInputValue(date: Date | null | undefined): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

export function isOverdue(paymentStatus: string, deadline: Date | null): boolean {
  if (!deadline || paymentStatus === "PAID" || paymentStatus === "NOT_REQUIRED") return false;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return deadline < today;
}
