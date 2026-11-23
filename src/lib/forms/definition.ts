import { z } from "zod";

/**
 * Application form definition, edited per edition in the admin form builder and stored as jsonb
 * in app.form_definitions. Shared by the builder UI, the applicant form and server validation.
 */

export const localizedText = z.object({
  en: z.string().trim().min(1, "English text is required"),
  hi: z.string().trim().default(""),
});
export type LocalizedText = z.infer<typeof localizedText>;

export const QUESTION_TYPES = [
  "short_text",
  "long_text",
  "single_choice",
  "multi_choice",
  "email",
  "phone",
  "date",
  "file",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/** Answers to these questions are copied onto the applicant record on submit. */
export const PROFILE_FIELDS = ["full_name", "phone", "date_of_birth", "state", "college", "gender"] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];

export const questionSchema = z
  .object({
    id: z
      .string()
      .regex(/^[a-z][a-z0-9_]{1,40}$/, "Use lowercase letters, digits and underscores (e.g. why_policy)"),
    type: z.enum(QUESTION_TYPES),
    label: localizedText,
    help: localizedText.partial().optional(),
    required: z.boolean().default(false),
    wordLimit: z.number().int().positive().max(2000).optional(),
    maxLength: z.number().int().positive().max(20000).optional(),
    options: z.array(z.object({ value: z.string().min(1), label: localizedText })).optional(),
    /** Personal/contact data: hidden from reviewers and excluded from anonymised views. */
    pii: z.boolean().default(false),
    /** Map the answer onto the applicant profile (name, phone, state…). */
    profileField: z.enum(PROFILE_FIELDS).optional(),
  })
  .superRefine((q, ctx) => {
    if ((q.type === "single_choice" || q.type === "multi_choice") && (!q.options || q.options.length < 2)) {
      ctx.addIssue({ code: "custom", message: "Choice questions need at least two options", path: ["options"] });
    }
  });
export type Question = z.infer<typeof questionSchema>;

export const stepSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
  title: localizedText,
  questions: z.array(questionSchema).min(1),
});
export type FormStep = z.infer<typeof stepSchema>;

export const formDefinitionSchema = z
  .object({
    steps: z.array(stepSchema).min(1),
  })
  .superRefine((def, ctx) => {
    const seen = new Set<string>();
    for (const step of def.steps) {
      for (const q of step.questions) {
        if (seen.has(q.id)) {
          ctx.addIssue({ code: "custom", message: `Duplicate question id "${q.id}"` });
        }
        seen.add(q.id);
      }
    }
    const profileFields = def.steps.flatMap((s) => s.questions.map((q) => q.profileField).filter(Boolean));
    for (const required of ["full_name", "phone"] as const) {
      if (!profileFields.includes(required)) {
        ctx.addIssue({ code: "custom", message: `The form must include a question mapped to "${required}"` });
      }
    }
  });
export type FormDefinition = z.infer<typeof formDefinitionSchema>;

export function allQuestions(def: FormDefinition): Question[] {
  return def.steps.flatMap((s) => s.questions);
}

export type Answers = Record<string, string | string[] | undefined>;
