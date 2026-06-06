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
        // `@typescript-eslint/consistent-type-imports` is intentionally NOT
        // enabled. The codebase uses NestJS with `emitDecoratorMetadata: true`,
        // where constructor parameter types must be value imports so the
        // runtime reflect-metadata picks up the class reference. Enabling the
        // rule's autofix silently rewrites those to `import type {...}`, which
        // erases at runtime and breaks DI (Nest then sees `undefined` as the
        // dependency).
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
            // Only the classic rules. The React Compiler ruleset bundled
            // into eslint-plugin-react-hooks@7 (set-state-in-effect, refs,
            // purity, incompatible-library, components, …) targets projects
            // built with babel-plugin-react-compiler. Modern Admin does not
            // run the compiler, so those rules would flag idiomatic code and
            // unavoidable third-party APIs (react-hook-form, tanstack-table)
            // without buying us anything. Re-enable them if/when the
            // compiler is adopted.
            rules: {
              'react-hooks/rules-of-hooks': 'error',
              'react-hooks/exhaustive-deps': 'warn',
            },
          },
        ]
      : []),
  )
}
