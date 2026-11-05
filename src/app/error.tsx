"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-xl font-semibold">Unable to load PCN data</h1>
      <p className="mt-2 text-sm text-slate-600">Check the database connection and try again.</p>
      <button className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white" onClick={reset} type="button">
        Try again
      </button>
    </main>
  );
}
