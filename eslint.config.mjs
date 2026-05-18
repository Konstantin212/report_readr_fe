import nextVitals from "eslint-config-next/core-web-vitals.js";
import nextTypescript from "eslint-config-next/typescript.js";

export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "dist/**",
      "next-env.d.ts",
    ],
  },
  ...nextVitals,
  ...nextTypescript,
];
