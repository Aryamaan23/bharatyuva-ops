import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { JOBS, isJobName } from "@/server/jobs/registry";
import { runJob, type JobTrigger } from "@/server/jobs/runner";
import { safeEqual } from "@/server/security/crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron entry point. Vercel Cron sends `Authorization: Bearer $CRON_SECRET` on GET; pg_cron sends
 * the same header plus ?trigger=pg_cron. Anything without the secret gets 401.
 */
async function handle(request: NextRequest, ctx: RouteContext<"/api/cron/[job]">) {
  const auth = request.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${env().CRON_SECRET}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { job } = await ctx.params;
  if (!isJobName(job)) return NextResponse.json({ error: "unknown job" }, { status: 404 });
  const t = request.nextUrl.searchParams.get("trigger");
  const trigger: JobTrigger = t === "pg_cron" || t === "manual" || t === "test" ? t : "vercel";
  const result = await runJob(job, trigger, JOBS[job].run);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export const GET = handle;
export const POST = handle;
