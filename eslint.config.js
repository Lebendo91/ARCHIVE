import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    'dist',
    'coverage',
    'playwright-report',
    'test-results',
    'src-tauri/target',
    'src-tauri/gen',
    // Generated from the Rust types by ts-rs (`cargo test`).
    'src/types/bindings',
    // pdf.js resources copied from node_modules by vite.config.ts.
    'public/pdfjs',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      // Non-breaking spaces are written as the \u00a0 escape, never raw (CLAUDE.md): raw ones are invisible.
      'no-irregular-whitespace': [
        'error',
        { skipStrings: false, skipTemplates: false, skipJSXText: false },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/#[0-9a-fA-F]{6}\\b/]',
          message:
            'Use the design tokens from src/styles/tokens.css instead of hard-coded colours.',
        },
        {
          selector: 'TemplateElement[value.raw=/#[0-9a-fA-F]{6}\\b/]',
          message:
            'Use the design tokens from src/styles/tokens.css instead of hard-coded colours.',
        },
      ],
    },
  },
  {
    files: ['*.config.ts', 'tests/e2e/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.js'],
    extends: [js.configs.recommended, tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
]);
