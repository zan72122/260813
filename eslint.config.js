// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**", "playwright-report/**", "test-results/**"]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        sourceType: "module"
      }
    },
    rules: {
      "no-console": ["error", { allow: ["warn", "error"] }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
      // docs/INTERFACES.md の契約上、ペイロードなしイベントは `{}` 型で表現する（一言一句従う）
      "@typescript-eslint/no-empty-object-type": "off"
    }
  },
  {
    files: ["tests/**/*.ts", "e2e/**/*.ts", "*.config.ts"],
    rules: {
      "no-console": "off"
    }
  }
);
