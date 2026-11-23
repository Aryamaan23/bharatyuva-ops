import Link from "next/link";
import { PageHeader } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ADMIN_ROLES, hasRole, requireStaff } from "@/server/auth/session";
import { todayIst } from "@/server/domain/sequences";
import { getCurrentEditionForStaff } from "@/server/editions/admin";
import { listStaffOptions } from "@/server/outreach/crm";
import { addTaskAction, generateTimelineAction, saveTimelineAsTemplateAction, toggleChecklistAction, updateTaskAction } from "@/server/tasks/actions";
import { listTasks, listTaskTemplates, type TaskFilter } from "@/server/tasks/queries";

export const metadata = { title: "Tasks" };

const FILTERS: { key: TaskFilter; label: string }[] = [
  { key: "mine", label: "Mine" },
  { key: "overdue", label: "Overdue" },
  { key: "unassigned", label: "Unassigned" },
  { key: "all", label: "All open" },
  { key: "done", label: "Done" },
];

function weekLabel(due: string | null, today: string) {
  if (!due) return "No date";
  if (due < today) return "Overdue";
  const days = Math.round((new Date(due).getTime() - new Date(today).getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days < 7) return "This week";
  if (days < 14) return "Next week";
  return `Later: ${due.slice(0, 7)}`;
}

export default async function TasksPage({ searchParams }: PageProps<"/admin/tasks">) {
  const session = await requireStaff();
  const edition = await getCurrentEditionForStaff(session);
  if (!edition) return <PageHeader title="Tasks" description="No current edition." />;
  const sp = await searchParams;
  const filter = (FILTERS.find((f) => f.key === sp.filter)?.key ?? "mine") as TaskFilter;
  const [rows, staff, templates] = await Promise.all([listTasks(session, edition.id, filter), listStaffOptions(session), listTaskTemplates(session)]);
  const today = todayIst();
  const isAdmin = hasRole(session, ...ADMIN_ROLES);
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = filter === "done" ? "Done" : weekLabel(r.task.dueAt, today);
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  return (
    <>
      <PageHeader title="Tasks and timeline" description={`${edition.name}${edition.day1Date ? ` · Day 1 is ${edition.day1Date}` : ""}. Owners get overdue tasks in their morning digest.`} />
      <nav aria-label="Task filters" className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button key={f.key} asChild size="sm" variant={f.key === filter ? "default" : "outline"}>
            <Link href={`/admin/tasks?filter=${f.key}`}>{f.label}</Link>
          </Button>
        ))}
      </nav>

      <details className="mb-4 rounded-lg border border-border bg-white p-3">
        <summary className="cursor-pointer text-sm font-semibold">Add a task</summary>
        <form action={addTaskAction} className="mt-2 flex flex-wrap items-end gap-2">
          <input type="hidden" name="editionId" value={edition.id} />
          <Input name="title" placeholder="What needs doing" className="w-72" required aria-label="Title" />
          <Input name="dueAt" type="date" className="w-40" aria-label="Due date" />
          <select name="ownerEmail" aria-label="Owner" defaultValue={session.email} className="h-9 rounded-md border border-input bg-white px-2 text-sm">
            {staff.map((s) => (
              <option key={s.email} value={s.email}>
                {s.fullName}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm">
            Add
          </Button>
        </form>
      </details>

      {rows.length === 0 && (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">No tasks here.</CardContent>
        </Card>
      )}
      <div className="space-y-6">
        {[...groups.entries()].map(([label, items]) => (
          <section key={label}>
            <h2 className={`mb-2 font-semibold ${label === "Overdue" ? "text-destructive" : "text-brand-navy"}`}>
              {label} ({items.length})
            </h2>
            <ul className="space-y-2">
              {items.map(({ task: t, orgName }) => (
                <li key={t.id} className="rounded-lg border border-border bg-white p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">
                        {t.title}
                        {t.offsetDays !== null && <span className="ml-2 text-xs font-normal text-muted-foreground">Day {t.offsetDays >= 0 ? `+${t.offsetDays}` : t.offsetDays}</span>}
                      </p>
                      {orgName && t.partnershipId && (
                        <Link href={`/admin/outreach/${t.partnershipId}`} className="text-xs underline">
                          {orgName}
                        </Link>
                      )}
                      {t.notes && <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{t.notes}</p>}
                    </div>
                    <form action={updateTaskAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={t.id} />
                      <label className="sr-only" htmlFor={`o-${t.id}`}>
                        Owner
                      </label>
                      <select id={`o-${t.id}`} name="ownerEmail" defaultValue={t.ownerEmail ?? ""} className="h-8 rounded-md border border-input bg-white px-2 text-xs">
                        <option value="">Unassigned</option>
                        {staff.map((s) => (
                          <option key={s.email} value={s.email}>
                            {s.fullName}
                          </option>
                        ))}
                      </select>
                      <label className="sr-only" htmlFor={`d-${t.id}`}>
                        Due date
                      </label>
                      <Input id={`d-${t.id}`} name="dueAt" type="date" defaultValue={t.dueAt ?? ""} className="h-8 w-36 text-xs" />
                      <Button type="submit" size="sm" variant="outline">
                        Save
                      </Button>
                      <Button type="submit" size="sm" name="status" value={t.status === "done" ? "open" : "done"}>
                        {t.status === "done" ? "Reopen" : "Done"}
                      </Button>
                    </form>
                  </div>
                  {t.checklist.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {t.checklist.map((c, i) => (
                        <li key={i}>
                          <form action={toggleChecklistAction}>
                            <input type="hidden" name="id" value={t.id} />
                            <input type="hidden" name="index" value={i} />
                            <button type="submit" className="flex items-center gap-2 text-left text-sm" aria-pressed={c.done}>
                              <span aria-hidden="true" className="inline-flex size-4 items-center justify-center rounded border border-input">
                                {c.done ? "✓" : ""}
                              </span>
                              <span className={c.done ? "text-muted-foreground line-through" : ""}>{c.label}</span>
                            </button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {isAdmin && (
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Card>
            <CardContent className="space-y-2 py-4 text-sm">
              <h2 className="font-semibold">Generate the timeline</h2>
              <p className="text-muted-foreground">Creates dated tasks from a template, working back from Day 1. Re-running updates dates without duplicating.</p>
              {edition.day1Date ? (
                <form action={generateTimelineAction} className="flex flex-wrap gap-2">
                  <input type="hidden" name="editionId" value={edition.id} />
                  <select name="templateId" aria-label="Template" className="h-9 rounded-md border border-input bg-white px-2 text-sm">
                    <option value="">Standard 25-task timeline</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <Button type="submit" size="sm">
                    Generate
                  </Button>
                </form>
              ) : (
                <p>Set the Day 1 date in edition settings first.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-2 py-4 text-sm">
              <h2 className="font-semibold">Save as next year&apos;s template</h2>
              <form action={saveTimelineAsTemplateAction} className="flex gap-2">
                <input type="hidden" name="editionId" value={edition.id} />
                <Input name="name" defaultValue={`${edition.name} timeline`} aria-label="Template name" />
                <Button type="submit" size="sm">
                  Save
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
