import js from '@eslint/js';

export default [
  {
    ignores: [
      'tasks/**/buggy-*/',
      'tasks/**/source-*/',
      'results/',
      'tools/',
      '.eval-workspaces/',
      '.playwright/',
    ],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        // Node.js globals
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        console: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        require: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        AbortController: 'readonly',
      },
    },
    rules: {
      // Airbnb-inspired essentials
      'no-unused-vars': ['error', { 
        argsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],
      'no-console': 'off',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
];
