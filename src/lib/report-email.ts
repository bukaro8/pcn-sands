import { formatDate, noticeLabel } from "@/lib/reporting";

type PaymentAction = {
  paymentNoticeNumber: number | null;
  paymentStatus: string;
  paymentDeadline: Date | null;
  paymentAmountPence: number | null;
  pcn: { reference: string; vehicle: { registrationDisplay: string } };
};

export type ReportEmailView = {
  type: "WEEKLY" | "MONTHLY";
  periodStart: Date;
  periodEnd: Date;
  submitted: number;
  accepted: number;
  rejected: number;
  pending: number;
  payments: PaymentAction[];
};

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatAmount(pence: number | null) {
  return pence == null ? "Not recorded" : new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
}

export function buildReportEmailHtml(view: ReportEmailView) {
  const reportName = view.type === "WEEKLY" ? "Sands Weekly PCN Report" : "Sands Monthly PCN Report";
  const period = `${formatDate(view.periodStart)} - ${formatDate(view.periodEnd)}`;
  const paymentRows = view.payments.slice(0, 5).map((entry) => `<tr><td style="padding:14px 0;border-top:1px solid #dedfd7;"><div style="font-size:18px;line-height:24px;font-weight:700;color:#173d32;letter-spacing:.04em;">${escapeHtml(entry.pcn.vehicle.registrationDisplay)}</div><div style="font-size:12px;line-height:18px;color:#6d786f;">${escapeHtml(entry.pcn.reference)} · ${escapeHtml(noticeLabel(entry.paymentNoticeNumber))}</div></td><td align="right" style="padding:14px 0;border-top:1px solid #dedfd7;font-size:13px;line-height:20px;color:#173d32;"><strong>${escapeHtml(formatAmount(entry.paymentAmountPence))}</strong><br><span style="color:#6d786f;">Due ${entry.paymentDeadline ? escapeHtml(formatDate(entry.paymentDeadline)) : "not recorded"}</span></td></tr>`).join("");
  const morePayments = view.payments.length > 5 ? `<p style="margin:10px 0 0;font-size:12px;line-height:18px;color:#6d786f;">Plus ${view.payments.length - 5} further payment action${view.payments.length - 5 === 1 ? "" : "s"} in the attached PDF.</p>` : "";

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f3efe4;color:#173d32;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3efe4;"><tr><td align="center" style="padding:28px 12px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#fffdf7;border:1px solid #dedfd7;border-radius:18px;"><tr><td style="padding:34px 38px 28px;background:#173d32;border-radius:18px 18px 0 0;color:#fffdf7;"><div style="font-size:11px;line-height:16px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#b8cbb9;">PCA · PCN Coordination</div><h1 style="margin:12px 0 5px;font-family:Georgia,Times New Roman,serif;font-size:28px;line-height:34px;font-weight:700;">${reportName}</h1><div style="font-size:14px;line-height:21px;color:#dbe5dc;">${period}</div></td></tr><tr><td style="padding:30px 38px 12px;"><p style="margin:0 0 22px;font-size:15px;line-height:23px;color:#44594f;">Your executive PCN briefing is attached as a print-ready PDF. The summary below separates new submissions from decisions received during the reporting period.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td width="25%" style="padding:12px 7px 12px 0;"><div style="font-size:24px;font-weight:700;color:#173d32;">${view.submitted}</div><div style="font-size:11px;line-height:16px;color:#6d786f;">New submissions</div></td><td width="25%" style="padding:12px 7px;"><div style="font-size:24px;font-weight:700;color:#557b5c;">${view.accepted}</div><div style="font-size:11px;line-height:16px;color:#6d786f;">Accepted decisions</div></td><td width="25%" style="padding:12px 7px;"><div style="font-size:24px;font-weight:700;color:#a85845;">${view.rejected}</div><div style="font-size:11px;line-height:16px;color:#6d786f;">Rejected decisions</div></td><td width="25%" style="padding:12px 0 12px 7px;"><div style="font-size:24px;font-weight:700;color:#b17d25;">${view.pending}</div><div style="font-size:11px;line-height:16px;color:#6d786f;">Awaiting decision</div></td></tr></table></td></tr><tr><td style="padding:18px 38px 28px;"><h2 style="margin:0 0 4px;font-family:Georgia,Times New Roman,serif;font-size:19px;line-height:25px;color:#173d32;">Payment actions</h2>${view.payments.length ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${paymentRows}</table>${morePayments}` : `<p style="margin:10px 0 0;font-size:14px;line-height:21px;color:#557b5c;">No outstanding payment actions are included in this report.</p>`}</td></tr><tr><td style="padding:20px 38px;border-top:1px solid #dedfd7;font-size:12px;line-height:18px;color:#6d786f;">The attached PDF is the principal management document and includes complete payment statuses, deadlines and notice labels.</td></tr></table></td></tr></table></body></html>`;
}
