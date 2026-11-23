"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  PROFILE_FIELDS,
  QUESTION_TYPES,
  type FormDefinition,
  type FormStep,
  type Question,
  type QuestionType,
} from "@/lib/forms/definition";
import { saveFormAction } from "@/server/editions/actions";

const TYPE_LABELS: Record<QuestionType, string> = {
  short_text: "Short text",
  long_text: "Long text",
  single_choice: "Single choice",
  multi_choice: "Multiple choice",
  email: "Email",
  phone: "Phone",
  date: "Date",
  file: "File upload (PDF/JPG/PNG)",
};

function move<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr;
  const copy = [...arr];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item!);
  return copy;
}

const optionsToText = (q: Question) => (q.options ?? []).map((o) => [o.value, o.label.en, o.label.hi].join(" | ")).join("\n");
const textToOptions = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [value = "", en = "", hi = ""] = line.split("|").map((p) => p.trim());
      return { value, label: { en: en || value, hi } };
    });

export function FormBuilder({ editionId, initial }: { editionId: string; initial: FormDefinition }) {
  const [def, setDef] = useState<FormDefinition>(initial);
  const [optionDrafts, setOptionDrafts] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ ok: boolean; message: string; errors?: string[] } | null>(null);
  const [pending, start] = useTransition();

  const updateStep = (si: number, patch: Partial<FormStep>) =>
    setDef((d) => ({ steps: d.steps.map((s, i) => (i === si ? { ...s, ...patch } : s)) }));
  const updateQuestion = (si: number, qi: number, patch: Partial<Question>) =>
    updateStep(si, { questions: def.steps[si]!.questions.map((q, i) => (i === qi ? { ...q, ...patch } : q)) });

  const addStep = () =>
    setDef((d) => ({
      steps: [
        ...d.steps,
        {
          id: `step_${d.steps.length + 1}`,
          title: { en: "New step", hi: "" },
          questions: [{ id: `question_${Date.now() % 100000}`, type: "short_text", label: { en: "New question", hi: "" }, required: false, pii: false }],
        },
      ],
    }));
  const addQuestion = (si: number) =>
    updateStep(si, {
      questions: [
        ...def.steps[si]!.questions,
        { id: `question_${Date.now() % 100000}`, type: "short_text", label: { en: "New question", hi: "" }, required: false, pii: false },
      ],
    });

  const save = (publish: boolean) =>
    start(async () => {
      setResult(null);
      const res = await saveFormAction(editionId, def, publish);
      setResult(
        res.ok
          ? { ok: true, message: `Saved as version ${res.version}${res.published ? " and published. New applicants will see it." : " (draft, not published)."}` }
          : { ok: false, message: "Not saved. Fix these problems:", errors: res.errors },
      );
    });

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        The consent step and the review step are added automatically at the end. Questions marked <strong>PII</strong> are
        hidden from reviewers. Map name and phone to profile fields (required).
      </p>
      {def.steps.map((step, si) => (
        <section key={si} className="rounded-lg border border-border bg-white p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor={`s${si}-id`}>Step id</Label>
              <Input id={`s${si}-id`} value={step.id} onChange={(e) => updateStep(si, { id: e.target.value })} className="w-40 font-mono text-sm" />
            </div>
            <div className="min-w-48 flex-1 space-y-1">
              <Label htmlFor={`s${si}-en`}>Step title (English)</Label>
              <Input id={`s${si}-en`} value={step.title.en} onChange={(e) => updateStep(si, { title: { ...step.title, en: e.target.value } })} />
            </div>
            <div className="min-w-48 flex-1 space-y-1">
              <Label htmlFor={`s${si}-hi`}>Step title (Hindi)</Label>
              <Input id={`s${si}-hi`} lang="hi" value={step.title.hi} onChange={(e) => updateStep(si, { title: { ...step.title, hi: e.target.value } })} />
            </div>
            <div className="flex gap-1">
              <Button type="button" size="sm" variant="outline" onClick={() => setDef((d) => ({ steps: move(d.steps, si, si - 1) }))} aria-label={`Move step ${si + 1} up`}>
                ↑
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setDef((d) => ({ steps: move(d.steps, si, si + 1) }))} aria-label={`Move step ${si + 1} down`}>
                ↓
              </Button>
              <Button type="button" size="sm" variant="destructive" disabled={def.steps.length === 1} onClick={() => setDef((d) => ({ steps: d.steps.filter((_, i) => i !== si) }))}>
                Remove step
              </Button>
            </div>
          </div>

          <ol className="mt-4 space-y-3">
            {step.questions.map((q, qi) => {
              const optKey = `${si}-${qi}`;
              return (
                <li key={qi} className="rounded-md border border-border p-3">
                  <div className="grid gap-3 md:grid-cols-6">
                    <div className="space-y-1 md:col-span-1">
                      <Label htmlFor={`q${optKey}-id`}>Id</Label>
                      <Input id={`q${optKey}-id`} value={q.id} onChange={(e) => updateQuestion(si, qi, { id: e.target.value })} className="font-mono text-sm" />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <Label htmlFor={`q${optKey}-type`}>Type</Label>
                      <select
                        id={`q${optKey}-type`}
                        value={q.type}
                        onChange={(e) => updateQuestion(si, qi, { type: e.target.value as QuestionType })}
                        className="block h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
                      >
                        {QUESTION_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {TYPE_LABELS[t]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <Label htmlFor={`q${optKey}-profile`}>Save to profile as</Label>
                      <select
                        id={`q${optKey}-profile`}
                        value={q.profileField ?? ""}
                        onChange={(e) => updateQuestion(si, qi, { profileField: (e.target.value || undefined) as Question["profileField"] })}
                        className="block h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
                      >
                        <option value="">Not a profile field</option>
                        {PROFILE_FIELDS.map((f) => (
                          <option key={f} value={f}>
                            {f.replace("_", " ")}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-end gap-1 md:col-span-1">
                      <Button type="button" size="sm" variant="outline" onClick={() => updateStep(si, { questions: move(step.questions, qi, qi - 1) })} aria-label="Move question up">
                        ↑
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => updateStep(si, { questions: move(step.questions, qi, qi + 1) })} aria-label="Move question down">
                        ↓
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={step.questions.length === 1}
                        onClick={() => updateStep(si, { questions: step.questions.filter((_, i) => i !== qi) })}
                        aria-label="Remove question"
                      >
                        ✕
                      </Button>
                    </div>
                    <div className="space-y-1 md:col-span-3">
                      <Label htmlFor={`q${optKey}-en`}>Question (English)</Label>
                      <Input id={`q${optKey}-en`} value={q.label.en} onChange={(e) => updateQuestion(si, qi, { label: { ...q.label, en: e.target.value } })} />
                    </div>
                    <div className="space-y-1 md:col-span-3">
                      <Label htmlFor={`q${optKey}-hi`}>Question (Hindi)</Label>
                      <Input id={`q${optKey}-hi`} lang="hi" value={q.label.hi} onChange={(e) => updateQuestion(si, qi, { label: { ...q.label, hi: e.target.value } })} />
                    </div>
                    <div className="space-y-1 md:col-span-3">
                      <Label htmlFor={`q${optKey}-help-en`}>Help text (English, optional)</Label>
                      <Input
                        id={`q${optKey}-help-en`}
                        value={q.help?.en ?? ""}
                        onChange={(e) => updateQuestion(si, qi, { help: { ...q.help, en: e.target.value } })}
                      />
                    </div>
                    <div className="space-y-1 md:col-span-3">
                      <Label htmlFor={`q${optKey}-help-hi`}>Help text (Hindi, optional)</Label>
                      <Input
                        id={`q${optKey}-help-hi`}
                        lang="hi"
                        value={q.help?.hi ?? ""}
                        onChange={(e) => updateQuestion(si, qi, { help: { ...q.help, hi: e.target.value } })}
                      />
                    </div>
                    {(q.type === "single_choice" || q.type === "multi_choice") && (
                      <div className="space-y-1 md:col-span-6">
                        <Label htmlFor={`q${optKey}-opts`}>Options, one per line: value | English | Hindi</Label>
                        <Textarea
                          id={`q${optKey}-opts`}
                          rows={4}
                          className="font-mono text-sm"
                          value={optionDrafts[optKey] ?? optionsToText(q)}
                          onChange={(e) => {
                            setOptionDrafts((d) => ({ ...d, [optKey]: e.target.value }));
                            updateQuestion(si, qi, { options: textToOptions(e.target.value) });
                          }}
                        />
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-5 md:col-span-6">
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={q.required} onChange={(e) => updateQuestion(si, qi, { required: e.target.checked })} className="size-4" /> Required
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={q.pii} onChange={(e) => updateQuestion(si, qi, { pii: e.target.checked })} className="size-4" /> PII (hide from reviewers)
                      </label>
                      {q.type === "long_text" && (
                        <label className="flex items-center gap-2 text-sm">
                          Word limit
                          <Input
                            type="number"
                            min={1}
                            max={2000}
                            value={q.wordLimit ?? ""}
                            onChange={(e) => updateQuestion(si, qi, { wordLimit: e.target.value ? Number(e.target.value) : undefined })}
                            className="h-8 w-24"
                          />
                        </label>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => addQuestion(si)}>
            Add question
          </Button>
        </section>
      ))}
      <Button type="button" variant="outline" onClick={addStep}>
        Add step
      </Button>

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-border bg-white/95 py-3">
        <Button type="button" variant="outline" disabled={pending} onClick={() => save(false)}>
          Save draft version
        </Button>
        <Button type="button" disabled={pending} onClick={() => save(true)}>
          Save and publish
        </Button>
        {result && (
          <div role={result.ok ? "status" : "alert"} className={`text-sm ${result.ok ? "text-green-800" : "text-destructive"}`}>
            {result.message}
            {result.errors && (
              <ul className="list-disc pl-5">
                {result.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
