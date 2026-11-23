import "server-only";
import { drainDue } from "@/server/messaging/outbox";
import { sendWeeklyEmails } from "@/server/privileged/ambassadors";
import { checkReplies, processDueSteps } from "@/server/privileged/outreach";
import { runSeatAutomation } from "@/server/privileged/selection";
import { queueFeedbackEmails } from "@/server/privileged/event";
import { runRetentionSweep } from "@/server/privileged/retention";
import { supabaseService } from "@/server/auth/supabase";
import { queueDraftReminders } from "./draft-reminders";
import { sendMorningDigests } from "./morning-digest";
import type { JobResult } from "./runner";

type Job = { schedule: string; run: () => Promise<JobResult> };

/**
 * Every scheduled job. Vercel Hobby crons run at most once a day, so frequent jobs are triggered
 * by Supabase pg_cron calling /api/cron/<name> (see docs/PLAN.md §2 and README).
 */
export const JOBS = {
  morning: {
    schedule: "Daily 08:30 IST (Vercel cron)",
    run: async () => {
      const steps = await processDueSteps();
      const digests = await sendMorningDigests();
      // Retention sweep once a month (1st, IST). Idempotent, so a late or repeated run is harmless.
      let retention = null;
      if (new Date(Date.now() + 5.5 * 3600_000).getUTCDate() === 1) {
        retention = await runRetentionSweep();
        for (const id of retention.orphanUserIds) await supabaseService().auth.admin.deleteUser(id).catch(() => undefined);
      }
      const delivery = await drainDue(100);
      return { items: digests.items + steps.calls, detail: { ...steps, digests: digests.items, retention, delivery } };
    },
  },
  replies: {
    schedule: "Hourly 07:00–23:00 IST (pg_cron)",
    run: async () => {
      const tally = await checkReplies();
      return { items: tally.checked ?? 0, detail: tally };
    },
  },
  evening: {
    schedule: "Daily 18:00 IST (Vercel cron)",
    run: async () => {
      const reminders = await queueDraftReminders();
      const seats = await runSeatAutomation();
      const feedback = await queueFeedbackEmails();
      const sent = await drainDue(200);
      return { items: reminders.items + seats.reminders + seats.promoted + feedback, detail: { ...reminders.detail, seats, feedback, delivery: sent } };
    },
  },
  weekly: {
    schedule: "Mondays 09:00 IST (Vercel cron)",
    run: async () => {
      const r = await sendWeeklyEmails();
      const sent = await drainDue(200);
      return { items: r.ambassadors + r.owners, detail: { ...r, delivery: sent } };
    },
  },
  "drain-outbox": {
    schedule: "Every 5 min 09:00–19:00 IST (pg_cron), plus daily via Vercel",
    run: async () => {
      const tally = await drainDue(100);
      return { items: Object.values(tally).reduce((a, b) => a + b, 0), detail: tally };
    },
  },
} satisfies Record<string, Job>;


export type JobName = keyof typeof JOBS;

export function isJobName(name: string): name is JobName {
  return Object.hasOwn(JOBS, name);
}
