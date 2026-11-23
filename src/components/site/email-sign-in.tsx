"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fill } from "@/i18n/dictionaries/en";
import { requestMagicLink, verifyEmailCode, type MagicLinkState } from "@/server/auth/actions";
import { Turnstile } from "./turnstile";

export type EmailSignInCopy = {
  title: string;
  body: string;
  emailLabel: string;
  sendLink: string;
  sendingLink: string;
  linkSentTitle: string;
  linkSentBody: string;
  codeLabel: string;
  verifyCode: string;
  errors: { invalid_email: string; captcha: string; rateLimited: string; generic: string; code_invalid: string };
};

export function EmailSignIn({
  copy,
  next,
  locale,
  siteKey,
  linkError,
}: {
  copy: EmailSignInCopy;
  next: string;
  locale: string;
  siteKey: string | undefined;
  linkError?: string;
}) {
  const [state, send, sending] = useActionState<MagicLinkState, FormData>(requestMagicLink, { status: "idle" });
  const [codeState, verify, verifying] = useActionState<MagicLinkState, FormData>(verifyEmailCode, { status: "idle" });

  const sentEmail = state.status === "sent" ? state.email : codeState.status === "error" ? codeState.email : undefined;
  const error = state.status === "error" ? copy.errors[state.error] : null;

  if (sentEmail) {
    return (
      <div className="space-y-5" aria-live="polite">
        <div>
          <h2 className="text-xl font-bold text-brand-navy">{copy.linkSentTitle}</h2>
          <p className="mt-2">{fill(copy.linkSentBody, { email: sentEmail })}</p>
        </div>
        <form action={verify} className="space-y-3">
          <input type="hidden" name="email" value={sentEmail} />
          <input type="hidden" name="next" value={next} />
          <Label htmlFor="code">{copy.codeLabel}</Label>
          <div className="flex gap-2">
            <Input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,7}"
              maxLength={7}
              className="max-w-40 text-lg tracking-widest"
              required
              aria-invalid={codeState.status === "error"}
              aria-describedby={codeState.status === "error" ? "code-error" : undefined}
            />
            <Button type="submit" disabled={verifying}>
              {copy.verifyCode}
            </Button>
          </div>
          {codeState.status === "error" && (
            <p id="code-error" role="alert" className="text-sm text-destructive">
              {copy.errors.code_invalid}
            </p>
          )}
        </form>
      </div>
    );
  }

  return (
    <form action={send} className="space-y-4" noValidate={false}>
      <div>
        <h2 className="text-xl font-bold text-brand-navy">{copy.title}</h2>
        <p className="mt-2">{copy.body}</p>
      </div>
      {linkError && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {linkError}
        </p>
      )}
      <input type="hidden" name="next" value={next} />
      <div className="space-y-2">
        <Label htmlFor="email">{copy.emailLabel}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          defaultValue={state.status === "error" ? state.email : undefined}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "email-error" : undefined}
          className="text-base"
        />
      </div>
      <Turnstile siteKey={siteKey} language={locale} />
      {error && (
        <p id="email-error" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={sending} className="w-full sm:w-auto">
        {sending ? copy.sendingLink : copy.sendLink}
      </Button>
    </form>
  );
}
