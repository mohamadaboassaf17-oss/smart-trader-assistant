import js from '@eslint/js'
import security from 'eslint-plugin-security'
import tseslint from 'typescript-eslint'
import vue from 'eslint-plugin-vue'
import importX from 'eslint-plugin-import-x'
import prettier from 'eslint-config-prettier'
import vueTsEslintConfig from '@vue/eslint-config-typescript'

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      '*.config.js',
      '*.config.ts',
      'public/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  ...vueTsEslintConfig(),
  {
    plugins: { 'import-x': importX },
    rules: {
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'object', 'type'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import-x/no-unresolved': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      'vue/multi-word-component-names': 'off',
      'vue/no-multiple-template-root': 'off',
    },
    settings: {
      'import-x/resolver': {
        typescript: { project: './tsconfig.app.json' },
        node: true,
      },
    },
  },
  security.configs.recommended,
  {
    rules: {
      'security/detect-object-injection': 'off',
      // compat: eslint-plugin-security 3.0.1 uses context.getSourceCode() removed in ESLint 9+
      'security/detect-child-process': 'off',
      'security/detect-no-csrf-before-method-override': 'off',
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-non-literal-regexp': 'off',
      'security/detect-non-literal-require': 'off',
      'security/detect-unsafe-regex': 'off',
    },
  },
  prettier,
)
