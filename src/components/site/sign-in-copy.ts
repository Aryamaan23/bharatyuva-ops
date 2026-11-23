import type { Dictionary } from "@/i18n/dictionaries/en";
import type { EmailSignInCopy } from "./email-sign-in";

export function signInCopy(t: Dictionary, title: string, body: string): EmailSignInCopy {
  return {
    title,
    body,
    emailLabel: t.apply.emailLabel,
    sendLink: t.apply.sendLink,
    sendingLink: t.apply.sendingLink,
    linkSentTitle: t.apply.linkSentTitle,
    linkSentBody: t.apply.linkSentBody,
    codeLabel: t.apply.codeLabel,
    verifyCode: t.apply.verifyCode,
    errors: {
      invalid_email: t.apply.errors.invalid_email,
      captcha: t.apply.errors.captcha,
      rateLimited: t.apply.errors.rateLimited,
      generic: t.apply.errors.generic,
      code_invalid: t.apply.errors.codeInvalid,
    },
  };
}
