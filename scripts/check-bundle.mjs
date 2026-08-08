#!/usr/bin/env node
/**
 * 번들 크기 예산 검사 (design/06-architecture.md §5)
 * 초기 로드가 커지는 것을 CI에서 막는다.
 */
import { gzipSync } from 'node:zlib'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIST = 'dist/assets'

/** [라벨, 파일 매칭 규칙, gzip 상한(KB)] */
const BUDGETS = [
  ['초기 JS (엔진 + UI)', (name) => name.startsWith('index-') && name.endsWith('.js'), 160],
  ['초기 CSS', (name) => name.endsWith('.css'), 20],
  ['차트 청크 (지연 로딩)', (name) => name.startsWith('charts-') && name.endsWith('.js'), 130],
  ['Monte Carlo 워커', (name) => name.includes('montecarlo.worker') && name.endsWith('.js'), 30],
]

let files
try {
  files = readdirSync(DIST)
} catch {
  console.error(`❌ ${DIST} 를 읽을 수 없습니다. 먼저 vite build 를 실행하세요.`)
  process.exit(1)
}

function gzipKb(name) {
  return gzipSync(readFileSync(join(DIST, name))).length / 1024
}

let failed = false
console.log('\n번들 크기 (gzip):')

for (const [label, match, limitKb] of BUDGETS) {
  const matched = files.filter(match)
  if (matched.length === 0) {
    console.log(`  ⚠ ${label}: 해당 파일 없음`)
    continue
  }
  const totalKb = matched.reduce((sum, name) => sum + gzipKb(name), 0)
  const ok = totalKb <= limitKb
  if (!ok) failed = true
  console.log(
    `  ${ok ? '✓' : '✗'} ${label}: ${totalKb.toFixed(1)} KB / ${limitKb} KB` +
      (matched.length > 1 ? ` (${matched.length}개 파일)` : ''),
  )
}

if (failed) {
  console.error('\n❌ 번들 예산을 초과했습니다. 지연 로딩이나 의존성 축소를 검토하세요.\n')
  process.exit(1)
}

console.log('✅ 모든 번들이 예산 이내입니다.\n')
