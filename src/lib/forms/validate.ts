import { normalizePhone } from "@/lib/contact";
import { allQuestions, type Answers, type FormDefinition, type FormStep, type Question } from "./definition";

export type AnswerError =
  | "required"
  | "too_many_words"
  | "too_long"
  | "invalid_email"
  | "invalid_phone"
  | "invalid_option"
  | "invalid_date";

export type AnswerErrors = Record<string, AnswerError>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_MAX_LENGTH = { short_text: 300, long_text: 12000 } as const;

export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/u).length : 0;
}

function isEmpty(value: Answers[string]): boolean {
  if (value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  return value.trim() === "";
}

export function validateQuestion(q: Question, value: Answers[string]): AnswerError | null {
  if (isEmpty(value)) return q.required ? "required" : null;

  switch (q.type) {
    case "short_text":
    case "long_text": {
      if (typeof value !== "string") return "required";
      const max = q.maxLength ?? DEFAULT_MAX_LENGTH[q.type];
      if (value.length > max) return "too_long";
      if (q.wordLimit && wordCount(value) > q.wordLimit) return "too_many_words";
      return null;
    }
    case "email":
      return typeof value === "string" && EMAIL_RE.test(value.trim()) ? null : "invalid_email";
    case "phone":
      return typeof value === "string" && normalizePhone(value) ? null : "invalid_phone";
    case "date": {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "invalid_date";
      const d = new Date(`${value}T00:00:00Z`);
      return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? "invalid_date" : null;
    }
    case "single_choice": {
      const allowed = new Set(q.options?.map((o) => o.value));
      return typeof value === "string" && allowed.has(value) ? null : "invalid_option";
    }
    case "multi_choice": {
      const allowed = new Set(q.options?.map((o) => o.value));
      return Array.isArray(value) && value.every((v) => allowed.has(v)) ? null : "invalid_option";
    }
    case "file":
      // Value is the storage path written by our upload action; presence is all we check here.
      return typeof value === "string" ? null : "required";
  }
}

/**
 * Validate a set of questions. With `partial`, "required" is not enforced (draft autosave),
 * but format errors are still reported so bad data is never stored.
 */
export function validateQuestions(questions: Question[], answers: Answers, opts: { partial?: boolean } = {}) {
  const errors: AnswerErrors = {};
  for (const q of questions) {
    const err = validateQuestion(q, answers[q.id]);
    if (err && !(opts.partial && err === "required")) errors[q.id] = err;
  }
  return errors;
}

export function validateStep(step: FormStep, answers: Answers, opts: { partial?: boolean } = {}) {
  return validateQuestions(step.questions, answers, opts);
}

export function validateForm(def: FormDefinition, answers: Answers, opts: { partial?: boolean } = {}) {
  return validateQuestions(allQuestions(def), answers, opts);
}

/** Drop answers to questions that no longer exist and coerce types, so jsonb stays clean. */
export function sanitizeAnswers(def: FormDefinition, input: Record<string, unknown>): Answers {
  const out: Answers = {};
  for (const q of allQuestions(def)) {
    const raw = input[q.id];
    if (raw === undefined || raw === null) continue;
    if (q.type === "multi_choice") {
      const arr = Array.isArray(raw) ? raw : [raw];
      out[q.id] = arr.filter((v): v is string => typeof v === "string");
    } else if (typeof raw === "string") {
      out[q.id] = q.type === "long_text" ? raw.replace(/\r\n/g, "\n") : raw.trim();
    }
  }
  return out;
}
