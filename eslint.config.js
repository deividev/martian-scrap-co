import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'dist-electron/**', 'release/**', 'node_modules/**', 'references/**', '.check-logs/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.cts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.electron.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      // `import x = require()` is the CommonJS form the sandboxed preload needs.
      '@typescript-eslint/no-require-imports': ['error', { allowAsImport: true }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    // Architecture §2: domain rules stay free of rendering, desktop, native and DOM dependencies.
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['three', 'three/*', 'electron', 'node:*', '**/presentation/**', '**/platform/**', '**/ui/**'] },
      ],
    },
  },
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    languageOptions: { globals: globals.node },
  },
);
