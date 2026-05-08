import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    ".claude/worktrees/**",
    "out/**",
    "build/**",
    "src/app/.well-known/workflow/**",
    "next-env.d.ts",
  ]),
  {
    files: ["src/components/ai-elements/**"],
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
    rules: {
      // Vendored from Vercel AI Elements. Re-vendor upstream changes instead
      // of hand-refactoring this directory to satisfy newer lint rules.
      "@next/next/no-img-element": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
