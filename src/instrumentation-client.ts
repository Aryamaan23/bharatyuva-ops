// Sentry is loaded on demand, and only when a DSN is configured, so it adds nothing to the
// initial bundle on low-end phones.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  void import("@sentry/nextjs").then((Sentry) =>
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
      tracesSampleRate: 0.05,
      // Applicant data must never reach Sentry: no bodies, cookies, query strings or user info.
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: { request: { allow: ["user-agent", "content-type"] }, response: false },
        httpBodies: [],
        urlQueryParams: false,
      },
    }),
  );
}
