import { formatDate } from "@/lib/reporting";
import type { ChecklistTaskView } from "@/lib/checklist";

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function taskTitle(task: ChecklistTaskView) {
  if (task.type === "PREPARE_CHALLENGE") return "Prepare or submit challenge";
  if (task.type === "CHALLENGE_STATUS_CHECK") return "Check challenge status";
  if (task.type === "REVIEW_SUBSEQUENT_NOTICE") return "Review new notice information";
  return "Review recorded decision";
}

export function buildChecklistEmailHtml(tasks: ChecklistTaskView[], baseUrl: string, date = new Date()) {
  const dateLabel = new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeZone: "Europe/London" }).format(date);
  const rows = tasks.map((task) => {
    const href = new URL(`/pcns/${task.pcnId}`, baseUrl).toString();
    const overdue = task.dueAt.getTime() < Date.now();
    return `<tr><td style="padding:14px 0;border-top:1px solid #dedfd7;"><div style="font-size:16px;line-height:22px;font-weight:700;color:#173d32;">${escapeHtml(taskTitle(task))}</div><div style="font-size:13px;line-height:19px;color:#6d786f;">${escapeHtml(task.registration)} · ${escapeHtml(task.reference)}</div></td><td align="right" style="padding:14px 0;border-top:1px solid #dedfd7;white-space:nowrap;"><a href="${escapeHtml(href)}" style="display:inline-block;padding:8px 12px;background:#356957;color:#ffffff;text-decoration:none;border-radius:6px;font-size:12px;font-weight:700;">Open case</a><div style="margin-top:6px;font-size:11px;color:${overdue ? "#a85845" : "#6d786f"};">${overdue ? "Overdue" : `Due ${escapeHtml(formatDate(task.dueAt))}`}</div></td></tr>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f3efe4;color:#173d32;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3efe4;"><tr><td align="center" style="padding:24px 12px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#fffdf7;border:1px solid #dedfd7;border-radius:18px;"><tr><td style="padding:30px 36px 24px;background:#173d32;border-radius:18px 18px 0 0;color:#fffdf7;"><div style="font-size:11px;line-height:16px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#b8cbb9;">Warm Workspace · Daily briefing</div><h1 style="margin:12px 0 5px;font-family:Georgia,Times New Roman,serif;font-size:27px;line-height:33px;">Today's PCN checklist</h1><div style="font-size:14px;line-height:21px;color:#dbe5dc;">${escapeHtml(dateLabel)}</div></td></tr><tr><td style="padding:28px 36px 12px;"><p style="margin:0;font-size:15px;line-height:23px;color:#44594f;">There ${tasks.length === 1 ? "is" : "are"} <strong>${tasks.length}</strong> item${tasks.length === 1 ? "" : "s"} requiring your attention today. Open each case to review and record the appropriate action.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:18px;">${rows}</table></td></tr><tr><td style="padding:20px 36px;border-top:1px solid #dedfd7;font-size:12px;line-height:18px;color:#6d786f;">This briefing includes only today's actionable cases. Completing a checklist item acknowledges the work; it does not submit challenges or change payment status.</td></tr></table></td></tr></table></body></html>`;
}
