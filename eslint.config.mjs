import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

// eslint-config-next 15.5.18 still ships legacy (eslintrc) format —
// `core-web-vitals.js` exports `{ extends: [...] }`, not a flat-config
// array — so spreading it directly throws "nextVitals is not iterable"
// during `next build` on Vercel. FlatCompat bridges the two formats.
const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

export default [
  {
    ignores: [
      ".next/**",
      ".claude/**",       // tooling (Claude Code hooks) — legitimately CJS
      "scripts/**",       // one-off DB scripts run via `node`, not bundled
      "node_modules/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "dist/**",
      "next-env.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // `_`-prefixed identifiers are the standard "intentionally unused"
      // convention (e.g. a provider implementing an interface method whose
      // parameter it doesn't need). Don't warn on those.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
];
