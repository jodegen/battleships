import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**'],
  },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      // Verfassung Prinzip IV: kein `any`.
      '@typescript-eslint/no-explicit-any': 'error',
      // FR-028/029: keine nicht-deterministischen oder umgebungsabhängigen Quellen in der Engine.
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Engine muss deterministisch sein — RNG injizieren (createRng).' },
        { object: 'Date', property: 'now', message: 'Engine darf nicht von der Wall-Clock abhängen.' },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: 'Engine darf nicht von der Wall-Clock abhängen.' },
      ],
      // FR-029: keine UI-/Node-/DOM-spezifischen Module in der Engine-Quelle.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['node:*', 'fs', 'path', 'os', 'crypto'], message: 'Engine ist framework-/umgebungsunabhängig — keine Node-Module.' },
          ],
        },
      ],
    },
  },
);
