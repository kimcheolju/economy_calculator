#!/usr/bin/env node
/**
 * ADR-3 강제 장치: src/calc/** 안에 세율·한도성 리터럴이 하드코딩되지 않았는지 검사한다.
 * (design/06-architecture.md §5)
 *
 * 정당한 예외는 해당 줄에 `// tax-literal-ok: <이유>` 주석을 달아 허용한다.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = 'src/calc'

/** 세율성 숫자 — 데이터 파일에만 존재해야 한다 */
const RATE_LITERALS = [
  '0.154', '0.099', '0.165', '0.132', '0.22', '0.055', '0.044', '0.033',
  '0.0719', '0.1314', '0.095', '0.43', '0.072', '0.06',
]

/** 한도성 금액 — 자릿수 구분자 유무 모두 검사 */
const AMOUNT_LITERALS = [
  '2000000', '2_000_000', '2500000', '2_500_000', '4000000', '4_000_000',
  '6000000', '6_000_000', '9000000', '9_000_000', '10000000', '10_000_000',
  '15000000', '15_000_000', '18000000', '18_000_000', '20000000', '20_000_000',
  '40000000', '40_000_000', '200000000', '200_000_000',
]

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (full.endsWith('.ts')) out.push(full)
  }
  return out
}

const violations = []

for (const file of walk(ROOT)) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/)
  lines.forEach((line, idx) => {
    if (line.includes('tax-literal-ok')) return
    // 주석 줄은 검사하지 않는다 (세법 근거 설명에 숫자가 등장하는 것은 정상)
    const trimmed = line.trim()
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return

    for (const lit of [...RATE_LITERALS, ...AMOUNT_LITERALS]) {
      // 숫자 경계를 확인해 0.0154 같은 부분일치를 배제
      const re = new RegExp(`(?<![\\d._])${lit.replace('.', '\\.')}(?![\\d_])`)
      if (re.test(line)) {
        violations.push(`${file}:${idx + 1}  세율/한도 리터럴 '${lit}' — 데이터 레이어로 옮기세요\n    ${trimmed}`)
        break
      }
    }
  })
}

if (violations.length > 0) {
  console.error('\n❌ ADR-3 위반: 계산 엔진에 세제 수치가 하드코딩되었습니다.\n')
  for (const v of violations) console.error('  ' + v)
  console.error(`\n총 ${violations.length}건. src/data/tax/ 로 옮기고 인자로 주입하세요.\n`)
  process.exit(1)
}

console.log('✅ check:tax — 계산 엔진에 하드코딩된 세제 수치가 없습니다.')
