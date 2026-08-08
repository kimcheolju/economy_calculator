import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

/**
 * 테스트는 순수 TypeScript(계산 엔진)만 대상으로 하므로 React·Tailwind 플러그인이 필요 없다.
 * vite.config.ts 와 분리해 두면 플러그인 로딩 없이 빠르게 돈다.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      include: ['src/calc/**', 'src/lib/**', 'src/data/**'],
      thresholds: {
        lines: 80,
        branches: 70,
      },
    },
  },
})
