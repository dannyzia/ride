import expoFlat from 'eslint-config-expo/flat.js';

export default [
  {
    ignores: ['_reference/**', 'utils-server/**', 'dist/**', 'build/**', 'android/**', 'ios/**', '.kilo/**', 'admin-test-results/**', 'App Design/**', 'scripts/**', 'server.js', 'start-ws.js'],
  },
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
