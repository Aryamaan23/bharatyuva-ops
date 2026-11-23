"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitDataRequest, type DataRequestState } from "@/server/privacy/actions";
import { Turnstile } from "./turnstile";

export function DataRequestForm({
  locale,
  siteKey,
  copy,
}: {
  locale: string;
  siteKey: string | undefined;
  copy: {
    kindLabel: string;
    kindDelete: string;
    kindAccess: string;
    emailLabel: string;
    reasonLabel: string;
    submit: string;
    errors: { invalid: string; captcha: string; rateLimited: string };
  };
}) {
  const [state, action, pending] = useActionState<DataRequestState, FormData>(submitDataRequest, { status: "idle" });
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="locale" value={locale} />
      <fieldset className="space-y-2">
        <legend className="mb-1 font-semibold">{copy.kindLabel}</legend>
        {(
          [
            ["delete", copy.kindDelete],
            ["access", copy.kindAccess],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2 has-[:checked]:border-brand-navy">
            <input type="radio" name="kind" value={value} defaultChecked={value === "delete"} className="size-5 accent-brand-navy" />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>
      <div className="space-y-2">
        <Label htmlFor="dr-email">{copy.emailLabel}</Label>
        <Input id="dr-email" name="email" type="email" autoComplete="email" required className="text-base" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="dr-reason">{copy.reasonLabel}</Label>
        <Textarea id="dr-reason" name="reason" rows={3} maxLength={1000} />
      </div>
      <Turnstile siteKey={siteKey} language={locale} />
      {state.status === "error" && state.error && (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {copy.errors[state.error]}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending}>
        {copy.submit}
      </Button>
    </form>
  );
}
