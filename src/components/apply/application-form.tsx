"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Answers, FormDefinition } from "@/lib/forms/definition";
import { validateStep, type AnswerErrors } from "@/lib/forms/validate";
import { saveDraftAction, submitApplicationAction } from "@/server/applications/actions";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { localized, QuestionField } from "./question-field";

type Props = {
  applicationId: string;
  locale: string;
  definition: FormDefinition;
  initialAnswers: Answers;
  initialStep: number;
  t: Pick<Dictionary, "apply" | "common" | "portal">;
  consentText: { processing: string; whatsapp: string };
  privacyHref: string;
};

type SaveState = "idle" | "saving" | "saved" | "error";
type Age = "adult" | "minor" | null;

const AUTOSAVE_MS = 1500;

export function ApplicationForm({
  applicationId,
  locale,
  definition,
  initialAnswers,
  initialStep,
  t,
  consentText,
  privacyHref,
}: Props) {
  const steps = definition.steps;
  const consentIndex = steps.length;
  const reviewIndex = steps.length + 1;
  const totalSteps = steps.length + 2;

  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const [step, setStep] = useState(Math.min(initialStep, consentIndex));
  const [errors, setErrors] = useState<AnswerErrors>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [consentProcessing, setConsentProcessing] = useState(false);
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);
  const [age, setAge] = useState<Age>(null);
  const [guardian, setGuardian] = useState({ name: "", email: "", relation: "" });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();

  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const answersRef = useRef(answers);
  const stepRef = useRef(step);

  useEffect(() => {
    answersRef.current = answers;
    stepRef.current = step;
  }, [answers, step]);

  const save = useCallback(async () => {
    if (!dirty.current) return true;
    dirty.current = false;
    setSaveState("saving");
    const res = await saveDraftAction({ applicationId, answers: answersRef.current as Record<string, string | string[]>, step: stepRef.current });
    if (res.ok || res.error === "invalid") {
      setSaveState("saved");
      return true;
    }
    dirty.current = true;
    setSaveState("error");
    return false;
  }, [applicationId]);

  // Debounced autosave, plus a best-effort save when the tab is hidden (phone locked, app switched).
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void save();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [save]);

  const setAnswer = (id: string, value: string | string[]) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
    if (errors[id]) setErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== id)));
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), AUTOSAVE_MS);
  };

  const goTo = async (next: number) => {
    setFormError(null);
    if (timer.current) clearTimeout(timer.current);
    dirty.current = true;
    stepRef.current = next;
    setStep(next);
    void save();
    window.scrollTo({ top: 0 });
    requestAnimationFrame(() => headingRef.current?.focus());
  };

  const showErrors = (errs: AnswerErrors) => {
    setErrors(errs);
    setFormError(t.apply.errors.fixErrors);
    requestAnimationFrame(() => summaryRef.current?.focus());
  };

  const nextFromQuestions = () => {
    const errs = validateStep(steps[step]!, answers);
    if (Object.keys(errs).length) return showErrors(errs);
    void goTo(step + 1);
  };

  const nextFromConsent = () => {
    if (!consentProcessing) return setFormError(t.apply.errors.consent);
    if (!age) return setFormError(t.apply.errors.age);
    if (age === "minor" && (!guardian.name.trim() || !guardian.email.includes("@") || !guardian.relation.trim())) {
      return setFormError(t.apply.errors.guardian);
    }
    void goTo(reviewIndex);
  };

  const submit = () =>
    startSubmit(async () => {
      setFormError(null);
      await save();
      const res = await submitApplicationAction({
        applicationId,
        locale,
        consentProcessing,
        whatsappOptIn,
        age,
        guardian: age === "minor" ? guardian : null,
      });
      // On success the action redirects; anything returned is an error.
      if (res.fieldErrors && Object.keys(res.fieldErrors).length) {
        const firstBad = steps.findIndex((s) => s.questions.some((q) => res.fieldErrors?.[q.id]));
        setErrors(res.fieldErrors);
        if (firstBad >= 0) {
          setStep(firstBad);
          stepRef.current = firstBad;
        }
      }
      const key = res.error as keyof typeof t.apply.errors;
      setFormError(t.apply.errors[key] ?? t.apply.errors.generic);
      requestAnimationFrame(() => summaryRef.current?.focus());
    });

  const errorText = (id: string) => (errors[id] ? t.apply.errors[errors[id]] : null);
  const fieldCopy = {
    required: t.common.required,
    optional: t.common.optional,
    wordsUsed: t.apply.wordsUsed,
    upload: t.portal.upload,
    uploading: t.portal.uploading,
    uploaded: t.portal.uploaded,
    replace: t.portal.replace,
    uploadFailed: t.apply.uploadFailed,
  };

  const stepTitle =
    step < consentIndex ? localized(steps[step]!.title, locale) : step === consentIndex ? t.apply.consentStepTitle : t.apply.reviewTitle;
  const errorEntries = Object.entries(errors);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>{t.apply.stepOf.replace("{current}", String(step + 1)).replace("{total}", String(totalSteps))}</span>
        <span aria-live="polite" role="status">
          {saveState === "saving" && t.common.saving}
          {saveState === "saved" && t.apply.draftSaved}
          {saveState === "error" && <span className="text-destructive">{t.apply.draftSaveFailed}</span>}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
        <div className="h-full bg-brand-navy transition-all" style={{ width: `${((step + 1) / totalSteps) * 100}%` }} />
      </div>

      <h2 ref={headingRef} tabIndex={-1} className="text-2xl font-bold text-brand-navy outline-none">
        {stepTitle}
      </h2>

      {formError && (
        <div ref={summaryRef} tabIndex={-1} role="alert" className="rounded-md border border-destructive bg-destructive/5 p-4 outline-none">
          <p className="font-semibold text-destructive">{formError}</p>
          {errorEntries.length > 0 && step < consentIndex && (
            <ul className="mt-2 list-disc pl-5 text-sm">
              {errorEntries.map(([id, code]) => {
                const q = steps[step]!.questions.find((x) => x.id === id);
                return q ? (
                  <li key={id}>
                    <a href={`#q-${id}`} className="underline">
                      {localized(q.label, locale)}: {t.apply.errors[code]}
                    </a>
                  </li>
                ) : null;
              })}
            </ul>
          )}
        </div>
      )}

      {step < consentIndex && (
        <form
          className="space-y-7"
          onSubmit={(e) => {
            e.preventDefault();
            nextFromQuestions();
          }}
          noValidate
        >
          {steps[step]!.questions.map((q) => (
            <QuestionField
              key={q.id}
              question={q}
              value={answers[q.id]}
              error={errorText(q.id)}
              locale={locale}
              copy={fieldCopy}
              applicationId={applicationId}
              onChange={(v) => setAnswer(q.id, v)}
            />
          ))}
          <StepNav backLabel={t.common.back} nextLabel={t.common.next} onBack={step > 0 ? () => goTo(step - 1) : undefined} />
        </form>
      )}

      {step === consentIndex && (
        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            nextFromConsent();
          }}
          noValidate
        >
          <p>{t.apply.consentIntro}</p>
          <div className="rounded-md bg-muted p-4 text-sm whitespace-pre-line">{consentText.processing}</div>
          <p>
            <a href={privacyHref} target="_blank" rel="noopener" className="font-semibold text-brand-navy underline">
              {t.apply.readPrivacy}
            </a>
          </p>
          <CheckRow id="consent-processing" checked={consentProcessing} onChange={setConsentProcessing} label={t.apply.consentProcessingLabel} />
          <CheckRow id="consent-whatsapp" checked={whatsappOptIn} onChange={setWhatsappOptIn} label={t.apply.consentWhatsappLabel} hint={consentText.whatsapp} />

          <fieldset className="space-y-2">
            <legend className="mb-1 font-semibold">{t.apply.ageQuestion}</legend>
            {(
              [
                ["adult", t.apply.ageLabel],
                ["minor", t.apply.under18Label],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2 has-[:checked]:border-brand-navy has-[:checked]:bg-secondary">
                <input type="radio" name="age" value={value} checked={age === value} onChange={() => setAge(value)} className="size-5 accent-brand-navy" />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>

          {age === "minor" && (
            <fieldset className="space-y-4 rounded-md border border-border p-4">
              <legend className="px-1 font-semibold">{t.apply.guardianTitle}</legend>
              <p className="text-sm">{t.apply.guardianBody}</p>
              <TextRow id="g-name" label={t.apply.guardianName} value={guardian.name} onChange={(v) => setGuardian((g) => ({ ...g, name: v }))} autoComplete="off" />
              <TextRow id="g-email" type="email" label={t.apply.guardianEmail} value={guardian.email} onChange={(v) => setGuardian((g) => ({ ...g, email: v }))} autoComplete="off" />
              <TextRow id="g-rel" label={t.apply.guardianRelation} value={guardian.relation} onChange={(v) => setGuardian((g) => ({ ...g, relation: v }))} autoComplete="off" />
            </fieldset>
          )}
          <StepNav backLabel={t.common.back} nextLabel={t.common.next} onBack={() => goTo(consentIndex - 1)} />
        </form>
      )}

      {step === reviewIndex && (
        <div className="space-y-6">
          <p>{t.apply.reviewBody}</p>
          {steps.map((s, i) => (
            <section key={s.id} className="rounded-lg border border-border p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-bold text-brand-navy">{localized(s.title, locale)}</h3>
                <Button variant="outline" size="sm" onClick={() => goTo(i)}>
                  {t.apply.edit}
                </Button>
              </div>
              <dl className="mt-3 space-y-3">
                {s.questions.map((q) => {
                  const v = answers[q.id];
                  const display =
                    q.type === "file"
                      ? v
                        ? `✓ ${t.portal.uploaded}`
                        : "—"
                      : Array.isArray(v)
                        ? v.map((x) => localized(q.options?.find((o) => o.value === x)?.label, locale) || x).join(", ")
                        : q.type === "single_choice"
                          ? localized(q.options?.find((o) => o.value === v)?.label, locale) || "—"
                          : v || "—";
                  return (
                    <div key={q.id}>
                      <dt className="text-sm font-semibold text-muted-foreground">{localized(q.label, locale)}</dt>
                      <dd className="whitespace-pre-line break-words">{display}</dd>
                    </div>
                  );
                })}
              </dl>
            </section>
          ))}
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" size="lg" onClick={() => goTo(consentIndex)}>
              {t.common.back}
            </Button>
            <Button size="lg" onClick={submit} disabled={submitting}>
              {submitting ? t.common.submitting : t.common.submit}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function StepNav({ backLabel, nextLabel, onBack }: { backLabel: string; nextLabel: string; onBack?: () => void }) {
  return (
    <div className="flex flex-wrap gap-3 pt-2">
      {onBack && (
        <Button type="button" variant="outline" size="lg" onClick={onBack}>
          {backLabel}
        </Button>
      )}
      <Button type="submit" size="lg">
        {nextLabel}
      </Button>
    </div>
  );
}

function CheckRow({ id, checked, onChange, label, hint }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <div className="flex items-start gap-3">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 size-5 shrink-0 accent-brand-navy" />
      <label htmlFor={id} className="cursor-pointer">
        {label}
        {hint && <span className="mt-1 block text-sm text-muted-foreground">{hint}</span>}
      </label>
    </div>
  );
}

function TextRow({
  id,
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} autoComplete={autoComplete} onChange={(e) => onChange(e.target.value)} className="text-base" />
    </div>
  );
}
