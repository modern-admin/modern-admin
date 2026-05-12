import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export function createAppConfig({
  browser = false,
  bun = false,
  node = false,
  react = false,
  ignores = [],
} = {}) {
  const runtimeGlobals = {
    ...(browser ? globals.browser : {}),
    ...(bun ? globals.bun : {}),
    ...(node ? globals.node : {}),
  }

  return tseslint.config(
    {
      ignores: [
        '**/node_modules/**',
        '**/dist/**',
        '**/coverage/**',
        '**/.next/**',
        '**/playwright-report/**',
        '**/test-results/**',
        '**/*.d.ts',
        '**/src/generated/**',
        ...ignores,
      ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
      files: ['**/*.{ts,tsx,js,mjs,cjs}'],
      languageOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        globals: runtimeGlobals,
      },
      rules: {
        'comma-dangle': ['error', 'always-multiline'],
        indent: ['error', 2],
        'no-console': 'off',
        'no-undef': 'off',
        'no-trailing-spaces': 'error',
        'object-curly-spacing': ['error', 'always'],
        'prefer-const': 'error',
        '@typescript-eslint/consistent-type-imports': [
          'warn',
          {
            prefer: 'type-imports',
            fixStyle: 'inline-type-imports',
          },
        ],
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unused-vars': [
          'warn',
          {
            argsIgnorePattern: '^_',
            caughtErrorsIgnorePattern: '^_',
            varsIgnorePattern: '^_',
          },
        ],
        quotes: [
          'error',
          'single',
          {
            avoidEscape: true,
            allowTemplateLiterals: true,
          },
        ],
        semi: ['error', 'never'],
      },
    },
    ...(react
      ? [
          {
            files: ['**/*.{tsx,jsx}'],
            plugins: {
              'react-hooks': reactHooks,
            },
            rules: {
              ...reactHooks.configs.recommended.rules,
            },
          },
        ]
      : []),
  )
}
