import type { TemplateTask } from "@/server/db/schema";
import { addDays } from "./sequences";

export type PlannedTask = { title: string; offsetDays: number; dueAt: string; ownerEmail: string | null };

/** Turn a timeline template into dated tasks, working backwards (and forwards) from Day 1. */
export function planTimeline(day1: string, template: TemplateTask[]): PlannedTask[] {
  return [...template]
    .sort((a, b) => a.offsetDays - b.offsetDays)
    .map((t) => ({ title: t.title, offsetDays: t.offsetDays, dueAt: addDays(day1, t.offsetDays), ownerEmail: t.ownerEmail ?? null }));
}
