import "server-only";
import { and, eq } from "drizzle-orm";
import { ageOn, canonicalEmail, normalizePhone } from "@/lib/contact";
import { allQuestions, type Answers, type FormDefinition } from "@/lib/forms/definition";
import { sanitizeAnswers, validateForm, type AnswerErrors } from "@/lib/forms/validate";
import type { Locale } from "@/i18n/config";
import type { SessionUser } from "@/server/auth/session";
import { applicants, applications, consentRecords, guardianConsents, type Attribution } from "@/server/db/schema";
import { withUserDb } from "@/server/db/user";
import { applicationWindow } from "@/server/domain/editions";
import type { Edition, PublishedForm } from "@/server/privileged/editions";
import { getCurrentConsents, getFormVersion } from "@/server/privileged/editions";
import { hashToken, newToken } from "@/server/security/crypto";

export type Applicant = typeof applicants.$inferSelect;
export type Application = typeof applications.$inferSelect;

export async function loadMyApplication(user: SessionUser, editionId: string) {
  return withUserDb(user.claims, async (tx) => {
    const [applicant] = await tx.select().from(applicants).where(eq(applicants.userId, user.id)).limit(1);
    if (!applicant) return { applicant: null, application: null, guardian: null };
    const [application] = await tx
      .select()
      .from(applications)
      .where(and(eq(applications.applicantId, applicant.id), eq(applications.editionId, editionId)))
      .limit(1);
    const [guardian] = application
      ? await tx
          .select({ email: guardianConsents.guardianEmail, confirmedAt: guardianConsents.confirmedAt })
          .from(guardianConsents)
          .where(eq(guardianConsents.applicationId, application.id))
          .limit(1)
      : [];
    return { applicant, application: application ?? null, guardian: guardian ?? null };
  });
}

export async function startOrResumeDraft(
  user: SessionUser,
  edition: Edition,
  form: PublishedForm,
  ctx: { locale: Locale; attribution: Attribution; referralCode: string | null },
): Promise<Application> {
  return withUserDb(user.claims, async (tx) => {
    let [applicant] = await tx.select().from(applicants).where(eq(applicants.userId, user.id)).limit(1);
    if (!applicant) {
      [applicant] = await tx
        .insert(applicants)
        .values({ userId: user.id, email: user.email, emailCanonical: canonicalEmail(user.email) })
        .returning();
    }
    const [existing] = await tx
      .select()
      .from(applications)
      .where(and(eq(applications.applicantId, applicant!.id), eq(applications.editionId, edition.id)))
      .limit(1);
    if (existing) return existing;

    const [created] = await tx
      .insert(applications)
      .values({
        editionId: edition.id,
        applicantId: applicant!.id,
        formVersion: form.version,
        locale: ctx.locale,
        attribution: ctx.attribution,
        referralCode: ctx.referralCode,
      })
      .returning();
    return created!;
  });
}

export type SaveDraftResult = { ok: true } | { ok: false; error: "not_found" | "closed" | "invalid"; fieldErrors?: AnswerErrors };

export async function saveDraft(
  user: SessionUser,
  edition: Edition,
  input: { applicationId: string; answers: Record<string, unknown>; step: number },
): Promise<SaveDraftResult> {
  if (applicationWindow(edition, new Date()) !== "open") return { ok: false, error: "closed" };
  return withUserDb(user.claims, async (tx) => {
    const [app] = await tx
      .select({ id: applications.id, formVersion: applications.formVersion, answers: applications.answers })
      .from(applications)
      .where(and(eq(applications.id, input.applicationId), eq(applications.status, "draft")))
      .limit(1);
    if (!app) return { ok: false, error: "not_found" } as const;
    const form = await getFormVersion(edition.id, app.formVersion);
    if (!form) return { ok: false, error: "not_found" } as const;

    const merged = sanitizeAnswers(form.definition, { ...app.answers, ...input.answers });
    const fieldErrors = validateForm(form.definition, merged, { partial: true });
    // Store what is valid; report format errors so the form can highlight them.
    const clean: Answers = Object.fromEntries(Object.entries(merged).filter(([k]) => !fieldErrors[k]));
    await tx
      .update(applications)
      .set({ answers: clean, currentStep: Math.max(0, Math.min(input.step, form.definition.steps.length)) })
      .where(eq(applications.id, app.id));
    return Object.keys(fieldErrors).length ? ({ ok: false, error: "invalid", fieldErrors } as const) : ({ ok: true } as const);
  });
}

export type SubmitInput = {
  applicationId: string;
  consentProcessing: boolean;
  whatsappOptIn: boolean;
  age: "adult" | "minor" | null;
  guardian: { name: string; email: string; relation: string } | null;
  ipHash: string;
  userAgent: string | null;
};

export type SubmitError =
  | "not_found"
  | "closed"
  | "consent"
  | "age"
  | "guardian"
  | "underMinAge"
  | "fixErrors"
  | "misconfigured";

export type SubmitResult =
  | { ok: true; applicationId: string; guardianToken: string | null }
  | { ok: false; error: SubmitError; fieldErrors?: AnswerErrors };

function profileFromAnswers(def: FormDefinition, answers: Answers) {
  const profile: Partial<Pick<Applicant, "fullName" | "phoneE164" | "dateOfBirth" | "state" | "college" | "gender">> = {};
  for (const q of allQuestions(def)) {
    const v = answers[q.id];
    if (!q.profileField || typeof v !== "string" || !v) continue;
    switch (q.profileField) {
      case "full_name":
        profile.fullName = v;
        break;
      case "phone":
        profile.phoneE164 = normalizePhone(v);
        break;
      case "date_of_birth":
        profile.dateOfBirth = v;
        break;
      case "state":
        profile.state = v;
        break;
      case "college":
        profile.college = v;
        break;
      case "gender":
        profile.gender = v;
        break;
    }
  }
  return profile;
}

/**
 * Submit a draft. Runs entirely under RLS: the applicant may only move their own draft to
 * "submitted" and insert their own consent rows. Duplicate checks and emails happen afterwards
 * in the privileged layer (see actions).
 */
export async function submitApplication(user: SessionUser, edition: Edition, input: SubmitInput): Promise<SubmitResult> {
  const now = new Date();
  if (applicationWindow(edition, now) !== "open") return { ok: false, error: "closed" };
  if (!input.consentProcessing) return { ok: false, error: "consent" };
  if (!input.age) return { ok: false, error: "age" };
  if (input.age === "minor") {
    const g = input.guardian;
    const emailOk = g && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(g.email.trim());
    if (!g || !g.name.trim() || !g.relation.trim() || !emailOk) return { ok: false, error: "guardian" };
    if (g.email.trim().toLowerCase() === user.email) return { ok: false, error: "guardian" };
  }

  const consents = await getCurrentConsents();
  if (!consents.processing || !consents.whatsapp || !consents.guardian) return { ok: false, error: "misconfigured" };

  return withUserDb(user.claims, async (tx) => {
    const [app] = await tx
      .select()
      .from(applications)
      .where(and(eq(applications.id, input.applicationId), eq(applications.status, "draft")))
      .limit(1);
    if (!app) return { ok: false, error: "not_found" } as const;
    const form = await getFormVersion(edition.id, app.formVersion);
    if (!form) return { ok: false, error: "misconfigured" } as const;

    const fieldErrors = validateForm(form.definition, app.answers);
    if (Object.keys(fieldErrors).length) return { ok: false, error: "fixErrors", fieldErrors } as const;

    const profile = profileFromAnswers(form.definition, app.answers);
    if (profile.dateOfBirth && input.age === "adult") {
      const onDate = edition.day1Date ?? now.toISOString().slice(0, 10);
      if (ageOn(profile.dateOfBirth, onDate) < edition.minAge) return { ok: false, error: "underMinAge" } as const;
    }

    await tx.update(applicants).set(profile).where(eq(applicants.id, app.applicantId));
    await tx
      .update(applications)
      .set({
        status: "submitted",
        submittedAt: now,
        whatsappOptIn: input.whatsappOptIn,
        guardianRequired: input.age === "minor",
      })
      .where(eq(applications.id, app.id));

    await tx.insert(consentRecords).values([
      {
        applicantId: app.applicantId,
        applicationId: app.id,
        consentVersionId: consents.processing!.id,
        granted: true,
        ipHash: input.ipHash,
        userAgent: input.userAgent,
      },
      {
        applicantId: app.applicantId,
        applicationId: app.id,
        consentVersionId: consents.whatsapp!.id,
        granted: input.whatsappOptIn,
        ipHash: input.ipHash,
        userAgent: input.userAgent,
      },
    ]);

    let guardianToken: string | null = null;
    if (input.age === "minor" && input.guardian) {
      guardianToken = newToken();
      await tx.insert(guardianConsents).values({
        applicationId: app.id,
        guardianName: input.guardian.name.trim(),
        guardianEmail: input.guardian.email.trim().toLowerCase(),
        guardianRelation: input.guardian.relation.trim(),
        tokenHash: hashToken(guardianToken),
      });
    }
    return { ok: true, applicationId: app.id, guardianToken } as const;
  });
}
