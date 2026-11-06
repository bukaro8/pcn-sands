import Link from "next/link";

import { classifyDatabaseError, logDatabaseError } from "@/lib/database-errors";

export function DatabaseFailure({ error, operation, retryPath }: { error: unknown; operation: string; retryPath: string }) {
  logDatabaseError(operation, error);
  const failure = classifyDatabaseError(error);
  return <main className="mx-auto max-w-3xl px-4 py-12" role="alert"><h1 className="text-xl font-semibold">{failure.title}</h1><p className="mt-2 text-slate-600">{failure.explanation}</p>{failure.retry && <Link className="mt-4 inline-block rounded-md bg-slate-900 px-4 py-2 text-sm text-white" href={retryPath}>Try again</Link>}</main>;
}
