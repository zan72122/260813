import js from '@eslint/js';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'playwright-report/**', 'test-results/**', 'probe.mjs'],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        performance: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        setTimeout: 'readonly',
        globalThis: 'readonly',
        HTMLElement: 'readonly',
        URLSearchParams: 'readonly',
        AudioContext: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },
  {
    files: ['tests/**/*.js', '*.config.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        process: 'readonly',
        window: 'readonly',
        document: 'readonly',
        globalThis: 'readonly',
      },
    },
  },
];
