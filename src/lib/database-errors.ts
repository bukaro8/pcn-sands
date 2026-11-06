export type DatabaseFailureKind = "unavailable" | "configuration" | "migrations" | "query" | "internal";

const failures: Record<DatabaseFailureKind, { title: string; explanation: string; retry: boolean }> = {
  unavailable: { title: "Database is temporarily unavailable", explanation: "The database could not be reached. Please try again shortly.", retry: true },
  configuration: { title: "Database connection needs attention", explanation: "The application cannot authenticate or connect with its database settings. An administrator should check the deployment configuration.", retry: false },
  migrations: { title: "Database update is required", explanation: "A required database table or column is missing. An administrator should apply the pending migrations.", retry: false },
  query: { title: "Database request failed", explanation: "The database could not complete this request. Please retry; if it continues, contact the administrator.", retry: true },
  internal: { title: "Temporary server error", explanation: "The application could not complete this request. Please try again.", retry: true },
};

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as { code?: unknown; cause?: unknown };
  if (typeof candidate.code === "string") return candidate.code;
  return candidate.cause && candidate.cause !== error ? errorCode(candidate.cause) : undefined;
}

export function classifyDatabaseError(error: unknown) {
  const code = errorCode(error);
  let kind: DatabaseFailureKind = "internal";
  if (["P1000", "P1003", "P1010", "28P01", "3D000"].includes(code ?? "")) kind = "configuration";
  else if (["P1001", "P1002", "P1017", "ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET"].includes(code ?? "")) kind = "unavailable";
  else if (["P2021", "P2022", "42P01", "42703"].includes(code ?? "")) kind = "migrations";
  else if (code?.startsWith("P") || code?.length === 5) kind = "query";
  else if (error instanceof Error && /DATABASE_URL/.test(error.message)) kind = "configuration";
  return { kind, code, ...failures[kind] };
}

/** Logs only a known classification/code, never the error message or query. */
export function logDatabaseError(operation: string, error: unknown) {
  const result = classifyDatabaseError(error);
  console.error(`${operation} failed: database ${result.kind}${result.code ? ` (${result.code})` : ""}.`);
}
