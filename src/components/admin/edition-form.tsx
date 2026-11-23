"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveEdition, type EditionFormState } from "@/server/editions/actions";

export type EditionFormValues = Record<string, string>;

const STATUSES = ["draft", "outreach", "applications", "selection", "event", "closed"];

export function EditionForm({ id, values }: { id?: string; values: EditionFormValues }) {
  const [state, action, pending] = useActionState<EditionFormState, FormData>(saveEdition, {});
  const field = (name: string, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} defaultValue={values[name] ?? ""} aria-invalid={Boolean(state.errors?.[name])} {...props} />
      {state.errors?.[name] && <p className="text-xs text-destructive">{state.errors[name]}</p>}
    </div>
  );
  return (
    <form action={action} className="space-y-8">
      {id && <input type="hidden" name="id" value={id} />}
      <section className="grid gap-4 sm:grid-cols-2">
        {field("name", "Name", { required: true, placeholder: "Bharat Yuva 2.0" })}
        {field("slug", "Slug", { required: true, placeholder: "bharat-yuva-2" })}
        <div className="space-y-1">
          <Label htmlFor="status">Stage</Label>
          <select id="status" name="status" defaultValue={values.status ?? "draft"} className="block h-9 w-full rounded-md border border-input bg-white px-2 text-sm">
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        {field("contactEmail", "Public contact email", { type: "email" })}
      </section>

      <section>
        <h2 className="mb-3 font-semibold text-brand-navy">The three days</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="space-y-3 rounded-md border border-border p-3">
              {field(`day${n}Date`, `Day ${n} date`, { type: "date" })}
              {field(`day${n}Venue`, `Day ${n} venue / partner`)}
              {field(`day${n}City`, `Day ${n} city`)}
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <h2 className="font-semibold text-brand-navy sm:col-span-2">Applications (times in IST)</h2>
        {field("applicationsOpenAt", "Applications open", { type: "datetime-local" })}
        {field("applicationsCloseAt", "Deadline", { type: "datetime-local" })}
        {field("seatConfirmHours", "Hours to accept a seat offer", { type: "number", min: 12, max: 336 })}
        {field("minAge", "Minimum age without guardian consent", { type: "number", min: 13, max: 30 })}
        {field("retentionMonths", "Delete unsuccessful applications after (months)", { type: "number", min: 1, max: 60 })}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <h2 className="font-semibold text-brand-navy sm:col-span-2">Poster links (Drive/Storage URLs)</h2>
        {field("posterUniversity", "University poster", { type: "url" })}
        {field("posterDistrict", "District poster", { type: "url" })}
        {field("posterEmbassy", "Embassy poster", { type: "url" })}
        {field("posterGeneral", "General / applicant poster", { type: "url" })}
      </section>

      <section className="space-y-1">
        <Label htmlFor="postSelectionDocuments">Documents requested after selection</Label>
        <p className="text-xs text-muted-foreground">
          One per line: <code>key | English label | Hindi label | required</code>, e.g. <code>id_proof | Government photo ID | सरकारी फ़ोटो पहचान पत्र | required</code>
        </p>
        <Textarea id="postSelectionDocuments" name="postSelectionDocuments" rows={4} defaultValue={values.postSelectionDocuments ?? ""} className="font-mono text-sm" />
      </section>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : id ? "Save changes" : "Create edition"}
        </Button>
        {state.ok && <span role="status" className="text-sm text-green-800">Saved</span>}
        {state.errors && <span role="alert" className="text-sm text-destructive">Please fix the highlighted fields.</span>}
      </div>
    </form>
  );
}
