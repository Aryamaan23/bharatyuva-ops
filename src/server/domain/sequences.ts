import type { PartnerStage, SequenceStepKind } from "@/server/db/schema";

/** Days after the first email: follow-up 1 (day 5), follow-up 2 (day 12), then call the office. */
export const SEQUENCE_OFFSETS: Record<SequenceStepKind, number> = { first: 0, fu1: 5, fu2: 12, call: 15 };

export const EMAIL_STEPS: SequenceStepKind[] = ["first", "fu1", "fu2"];

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Today's date in IST as YYYY-MM-DD. */
export function todayIst(now = new Date()): string {
  return new Date(now.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

/** Follow-up due dates once the first email has actually gone out. */
export function followUpDates(firstSentDate: string): { step: SequenceStepKind; dueAt: string }[] {
  return (["fu1", "fu2", "call"] as const).map((step) => ({ step, dueAt: addDays(firstSentDate, SEQUENCE_OFFSETS[step]) }));
}

/** Pipeline stage after a step is sent. Never moves a partner backwards. */
export function stageAfterSend(current: PartnerStage, step: SequenceStepKind): PartnerStage {
  const next: Partial<Record<SequenceStepKind, PartnerStage>> = { first: "email_sent", fu1: "follow_up_1", fu2: "follow_up_2" };
  const target = next[step];
  const order: PartnerStage[] = ["not_contacted", "email_sent", "follow_up_1", "follow_up_2"];
  if (!target || !order.includes(current)) return current;
  return order.indexOf(target) > order.indexOf(current) ? target : current;
}

/** Stages in which automated follow-ups must not go out. */
export function sequenceHalted(stage: PartnerStage): boolean {
  return ["in_discussion", "confirmed", "declined", "do_not_contact"].includes(stage);
}
