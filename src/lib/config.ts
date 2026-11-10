export function isValidEmailAddress(value: string | undefined | null): value is string {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()));
}

export function getManagerEmail(): string | undefined {
  const value = process.env.MANAGER_EMAIL?.trim();
  return isValidEmailAddress(value) ? value : undefined;
}

export const appConfig = {
  get managerWeeklyReportRecipient() { return getManagerEmail(); },
  maxCaptureFileBytes: 10 * 1024 * 1024,
  openAiModel: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  get emailFrom() { return process.env.EMAIL_FROM?.trim() || undefined; },
  adminEmail: process.env.ADMIN_EMAIL,
} as const;
