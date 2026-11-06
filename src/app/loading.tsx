export default function Loading() {
  return <main className="min-h-screen px-5 py-8 sm:px-8 lg:px-12"><div className="space-y-7"><div className="skeleton h-56 w-full" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div className="skeleton h-36" key={index} />)}</div><div className="grid gap-5 lg:grid-cols-2"><div className="skeleton h-64" /><div className="skeleton h-64" /></div><span className="sr-only">Loading workspace…</span></div></main>;
}
