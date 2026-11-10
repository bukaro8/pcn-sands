export function addCalendarDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function defaultStatusCheckDate(submissionDate: Date): Date {
  return addCalendarDays(submissionDate, 14);
}

export function defaultStatusCheckDateValue(submissionDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(submissionDate)) return "";
  const date = new Date(`${submissionDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== submissionDate) return "";
  return defaultStatusCheckDate(date).toISOString().slice(0, 10);
}
