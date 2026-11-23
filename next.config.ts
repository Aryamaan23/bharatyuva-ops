import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  // Cache Components is opt-in. Almost every staff/portal page reads the session, so we keep the
  // previous caching model and make public pages static/ISR explicitly (see docs/PLAN.md).
  cacheComponents: false,
  poweredByHeader: false,
  // PDF rendering uses Node APIs and fonts at runtime; keep it out of the bundler.
  serverExternalPackages: ["@react-pdf/renderer", "exceljs"],
  typedRoutes: true,
  // Public pages and staff pages have separate root layouts, so the 404 page is global.
  experimental: { globalNotFound: true },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  // Source maps are only uploaded when SENTRY_AUTH_TOKEN is set (CI/Vercel).
  authToken: process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  telemetry: false,
});
