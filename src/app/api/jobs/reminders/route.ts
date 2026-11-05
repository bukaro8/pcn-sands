export const dynamic = "force-dynamic";

function authorized(request: Request) { return Boolean(process.env.CRON_SECRET) && request.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`; }

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { processPersonalReminders } = await import("@/lib/jobs");
  const result = await processPersonalReminders();
  return Response.json(result, { status: result.status === "failed" ? 500 : 200 });
}
