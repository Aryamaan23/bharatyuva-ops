import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// adminDb bypasses Row Level Security. Only background jobs, the message outbox and the
// explicitly privileged service layer may import it. Everything else uses withUserDb().
const ADMIN_DB_ALLOWED = [
  "src/server/jobs/**",
  "src/server/messaging/**",
  "src/server/privileged/**",
  "src/server/db/**",
  "scripts/**",
  "tests/**",
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ADMIN_DB_ALLOWED,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/server/db/admin",
              message: "adminDb bypasses RLS. Use withUserDb(), or move this code into src/server/privileged/.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "drizzle/**", "playwright-report/**", "test-results/**"]),
]);

export default eslintConfig;
