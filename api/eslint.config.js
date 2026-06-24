import tseslint from "typescript-eslint";

// Flat config (ESLint 9+). Start from the recommended TypeScript rules.
export default tseslint.config(
  {
    ignores: ["node_modules", "dist"],
  },
  ...tseslint.configs.recommended,
);
