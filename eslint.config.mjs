import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // web-reservas/ is a separate Next.js app (its own package.json,
    // node_modules, tsconfig, eslint config) — without this, ESLint's
    // non-"**/"-prefixed "out/**"/".next/**" patterns above only match at
    // the repo root, so this project's lint run was silently also linting
    // web-reservas' source (and, when present, its build output) using
    // this project's dependency versions instead of its own.
    "web-reservas/**",
  ]),
]);

export default eslintConfig;
