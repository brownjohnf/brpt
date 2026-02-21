import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["out/", "dist/", "node_modules/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-hooks/preserve-manual-memoization": "off",
    },
  },
  eslintConfigPrettier,
  {
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "Date",
          message: "Use Temporal from @js-temporal/polyfill instead.",
        },
      ],
    },
  }
);
