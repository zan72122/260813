const browser = {
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  location: 'readonly',
  performance: 'readonly',
  requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  URLSearchParams: 'readonly',
  AudioContext: 'readonly',
  webkitAudioContext: 'readonly',
  console: 'readonly',
  Image: 'readonly',
  HTMLElement: 'readonly',
};

export default [
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: browser,
    },
    linterOptions: { reportUnusedDisableDirectives: true },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'after-used', argsIgnorePattern: '^_' }],
      'no-const-assign': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-unreachable': 'error',
      'no-fallthrough': 'error',
      eqeqeq: ['warn', 'smart'],
    },
  },
  {
    files: ['tests/**/*.js', 'playwright.config.js'],
    languageOptions: {
      globals: { ...browser, process: 'readonly', __dirname: 'readonly' },
    },
  },
];
