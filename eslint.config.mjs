import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["scripts/**/*.js"],
    rules: {
      // These standalone Node utilities intentionally use CommonJS. The app
      // and TypeScript sources continue to enforce ESM imports.
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: ["src/hooks/**/*.ts"],
    rules: {
      // These hooks intentionally start Supabase/API revalidation from an
      // effect. Keep React 19's diagnostic visible while the data layer is
      // migrated to a cancellable external query store; component effects
      // remain errors so derived-state regressions cannot return.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
