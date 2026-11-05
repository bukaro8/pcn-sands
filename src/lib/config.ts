export const appConfig = {
  managerWeeklyReportRecipient: "Nimesh_joshi1@hotmail.com",
  maxCaptureFileBytes: 10 * 1024 * 1024,
  openAiModel: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  emailFrom: process.env.EMAIL_FROM,
  adminEmail: process.env.ADMIN_EMAIL,
} as const;
