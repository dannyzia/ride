import expoFlat from 'eslint-config-expo/flat.js';

export default [
  ...expoFlat,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-console': 'off',
      'react-hooks/exhaustive-deps': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      'no-unused-vars': 'off',
    },
  },
];
