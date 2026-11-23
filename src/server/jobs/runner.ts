import "server-only";
import { eq } from "drizzle-orm";
import { adminDb } from "@/server/db/admin";
import { jobRuns } from "@/server/db/schema";

export type JobResult = { items: number; detail?: Record<string, unknown> };
export type JobTrigger = "vercel" | "pg_cron" | "manual" | "test";

/** Run a job and record it in job_runs (shown on /admin/health). Jobs themselves must be idempotent. */
export async function runJob(job: string, trigger: JobTrigger, fn: () => Promise<JobResult>) {
  const db = adminDb();
  const [run] = await db.insert(jobRuns).values({ job, trigger }).returning({ id: jobRuns.id });
  try {
    const result = await fn();
    await db
      .update(jobRuns)
      .set({ status: "succeeded", finishedAt: new Date(), itemsProcessed: result.items, detail: result.detail ?? {} })
      .where(eq(jobRuns.id, run!.id));
    return { ok: true as const, ...result };
  } catch (err) {
    const error = err instanceof Error ? err.message.slice(0, 2000) : String(err);
    await db.update(jobRuns).set({ status: "failed", finishedAt: new Date(), error }).where(eq(jobRuns.id, run!.id));
    return { ok: false as const, error };
  }
}
