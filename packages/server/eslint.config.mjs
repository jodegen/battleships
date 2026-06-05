import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'prisma/migrations/**'],
  },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    rules: {
      // Verfassung Prinzip IV: kein `any`.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
);
