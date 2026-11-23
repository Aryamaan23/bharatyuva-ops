"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Answers, LocalizedText, Question } from "@/lib/forms/definition";
import { wordCount } from "@/lib/forms/validate";
import { uploadToSignedUrl } from "@/lib/supabase-browser";
import { createAnswerUploadAction } from "@/server/applications/actions";

export type FieldCopy = {
  required: string;
  optional: string;
  wordsUsed: string;
  upload: string;
  uploading: string;
  uploaded: string;
  replace: string;
  uploadFailed: string;
};

export function localized(text: Partial<LocalizedText> | undefined, locale: string): string {
  if (!text) return "";
  return (locale === "hi" && text.hi) || text.en || "";
}

type Props = {
  question: Question;
  value: Answers[string];
  error: string | null;
  locale: string;
  copy: FieldCopy;
  applicationId: string;
  onChange: (value: string | string[]) => void;
};

export function QuestionField({ question: q, value, error, locale, copy, applicationId, onChange }: Props) {
  const id = `q-${q.id}`;
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const describedBy = [q.help ? helpId : null, q.wordLimit ? `${id}-count` : null, error ? errorId : null]
    .filter(Boolean)
    .join(" ") || undefined;
  const label = (
    <>
      {localized(q.label, locale)}{" "}
      <span className="text-sm font-normal text-muted-foreground">({q.required ? copy.required : copy.optional})</span>
    </>
  );
  const help = q.help && localized(q.help, locale) && (
    <p id={helpId} className="text-sm text-muted-foreground">
      {localized(q.help, locale)}
    </p>
  );
  const errorEl = error && (
    <p id={errorId} className="text-sm font-semibold text-destructive">
      {error}
    </p>
  );
  const str = typeof value === "string" ? value : "";

  if (q.type === "single_choice" || q.type === "multi_choice") {
    const selected = new Set(Array.isArray(value) ? value : str ? [str] : []);
    const multi = q.type === "multi_choice";
    return (
      <fieldset className="space-y-2" aria-describedby={describedBy} aria-invalid={Boolean(error)} id={id} tabIndex={-1}>
        <legend className="mb-1 font-semibold">{label}</legend>
        {help}
        <div className="space-y-1.5">
          {q.options?.map((o) => (
            <label key={o.value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2 has-[:checked]:border-brand-navy has-[:checked]:bg-secondary">
              <input
                type={multi ? "checkbox" : "radio"}
                name={q.id}
                value={o.value}
                checked={selected.has(o.value)}
                className="size-5 accent-brand-navy"
                onChange={(e) => {
                  if (!multi) return onChange(o.value);
                  const next = new Set(selected);
                  if (e.target.checked) next.add(o.value);
                  else next.delete(o.value);
                  onChange([...next]);
                }}
              />
              <span>{localized(o.label, locale)}</span>
            </label>
          ))}
        </div>
        {errorEl}
      </fieldset>
    );
  }

  if (q.type === "file") {
    return (
      <FileField
        q={q}
        id={id}
        label={label}
        help={help}
        errorEl={errorEl}
        describedBy={describedBy}
        value={str}
        copy={copy}
        applicationId={applicationId}
        onChange={onChange}
      />
    );
  }

  const common = {
    id,
    name: q.id,
    value: str,
    "aria-describedby": describedBy,
    "aria-invalid": Boolean(error),
    required: q.required,
    className: "text-base",
  };

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block font-semibold">
        {label}
      </label>
      {help}
      {q.type === "long_text" ? (
        <>
          <Textarea {...common} rows={7} onChange={(e) => onChange(e.target.value)} />
          {q.wordLimit && (
            <p
              id={`${id}-count`}
              className={`text-sm ${wordCount(str) > q.wordLimit ? "font-semibold text-destructive" : "text-muted-foreground"}`}
              aria-live="polite"
            >
              {copy.wordsUsed.replace("{count}", String(wordCount(str))).replace("{limit}", String(q.wordLimit))}
            </p>
          )}
        </>
      ) : (
        <Input
          {...common}
          type={q.type === "email" ? "email" : q.type === "phone" ? "tel" : q.type === "date" ? "date" : "text"}
          inputMode={q.type === "phone" ? "tel" : q.type === "email" ? "email" : undefined}
          autoComplete={
            q.profileField === "full_name" ? "name" : q.profileField === "phone" ? "tel" : q.type === "email" ? "email" : q.profileField === "date_of_birth" ? "bday" : undefined
          }
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {errorEl}
    </div>
  );
}

function FileField({
  q,
  id,
  label,
  help,
  errorEl,
  describedBy,
  value,
  copy,
  applicationId,
  onChange,
}: {
  q: Question;
  id: string;
  label: React.ReactNode;
  help: React.ReactNode;
  errorEl: React.ReactNode;
  describedBy: string | undefined;
  value: string;
  copy: FieldCopy;
  applicationId: string;
  onChange: (v: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block font-semibold">
        {label}
      </label>
      {help}
      {value && <p className="text-sm text-green-800">✓ {copy.uploaded}</p>}
      <input
        id={id}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        aria-describedby={describedBy}
        disabled={busy}
        className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:font-semibold file:text-brand-navy"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setBusy(true);
          setFailed(false);
          const ticket = await createAnswerUploadAction({ applicationId, questionId: q.id, mime: file.type, size: file.size });
          const ok = ticket.ok && (await uploadToSignedUrl(ticket.path, ticket.token, file));
          setBusy(false);
          if (ok && ticket.ok) onChange(ticket.path);
          else setFailed(true);
        }}
      />
      {busy && <p className="text-sm text-muted-foreground">{copy.uploading}</p>}
      {failed && <p className="text-sm font-semibold text-destructive">{copy.uploadFailed}</p>}
      {errorEl}
    </div>
  );
}
