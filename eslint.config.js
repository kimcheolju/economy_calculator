import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: '프라이버시 원칙: 서버 통신 금지 (CLAUDE.md R-7)' },
        { name: 'XMLHttpRequest', message: '프라이버시 원칙: 서버 통신 금지 (CLAUDE.md R-7)' },
      ],
    },
  },

  /**
   * ADR-2: 계산 엔진과 데이터 레이어는 UI를 전혀 모른다.
   * 이 규칙이 아키텍처 경계를 실제로 강제하는 장치.
   */
  {
    files: ['src/calc/**/*.ts', 'src/data/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['react', 'react-*', 'zustand', 'recharts'], message: 'ADR-2: 계산 엔진은 UI를 모른다' },
            { group: ['@/components/*', '@/features/*', '@/store/*'], message: 'ADR-2: 의존 방향 역류 금지' },
          ],
        },
      ],
    },
  },

  /** 계산 엔진은 순수 함수 (CLAUDE.md R-4): Date/Math.random 금지 */
  {
    files: ['src/calc/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'R-4: 시드 PRNG를 인자로 받아야 한다' },
        { object: 'Date', property: 'now', message: 'R-4: 현재 시각은 인자로 받아야 한다' },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: 'R-4: 순수 함수 — 현재 시각은 인자로 받아야 한다' },
      ],
    },
  },

  { files: ['scripts/**/*.mjs', 'vite.config.ts'], languageOptions: { globals: { process: 'readonly', console: 'readonly' } } },
)
