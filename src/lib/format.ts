/**
 * 금액·비율 표기 (design/05-ui-ux.md §9)
 *
 * 한국 사용자는 1,234,560,000 을 즉시 읽지 못한다. 억/만원 단위가 필수다.
 */

const 만 = 10_000
const 억 = 100_000_000
const 조 = 1_000_000_000_000

export type MoneyFormat = 'default' | 'compact' | 'exact'

function group(n: number): string {
  return Math.round(n).toLocaleString('ko-KR')
}

/**
 * 한국식 금액 표기.
 *
 *   formatKRW(1_234_560_000)            → '12억 3,456만원'
 *   formatKRW(3_000_000)                → '300만원'
 *   formatKRW(1_234_560_000, 'compact') → '12.3억'
 *   formatKRW(1_200_000_000, 'exact')   → '1,200,000,000원'
 */
export function formatKRW(value: number, format: MoneyFormat = 'default'): string {
  if (!Number.isFinite(value)) return '—'

  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)

  if (format === 'exact') return `${sign}${group(abs)}원`

  if (format === 'compact') {
    if (abs >= 조) return `${sign}${(abs / 조).toFixed(1)}조`
    if (abs >= 억) return `${sign}${(abs / 억).toFixed(abs >= 10 * 억 ? 1 : 2)}억`
    if (abs >= 만) return `${sign}${Math.round(abs / 만).toLocaleString('ko-KR')}만`
    return `${sign}${group(abs)}`
  }

  if (abs < 1) return '0원'

  if (abs >= 조) {
    const jo = Math.floor(abs / 조)
    const restEok = Math.floor((abs % 조) / 억)
    return restEok > 0 ? `${sign}${group(jo)}조 ${group(restEok)}억원` : `${sign}${group(jo)}조원`
  }

  if (abs >= 억) {
    const eok = Math.floor(abs / 억)
    const restMan = Math.floor((abs % 억) / 만)
    return restMan > 0 ? `${sign}${group(eok)}억 ${group(restMan)}만원` : `${sign}${group(eok)}억원`
  }

  if (abs >= 만) {
    const man = Math.floor(abs / 만)
    return `${sign}${group(man)}만원`
  }

  return `${sign}${group(abs)}원`
}

/** 입력 필드 아래에 보여주는 단위 힌트 — 0 하나 차이 오타를 즉시 알아채게 한다 */
export function formatMoneyHint(value: number): string {
  if (!Number.isFinite(value) || value === 0) return ''
  return `→ ${formatKRW(value)}`
}

export function formatPercent(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '—'
  return `${(value * 100).toFixed(digits)}%`
}

export function formatSignedPercent(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${(value * 100).toFixed(digits)}%`
}

export function formatAge(age: number): string {
  return `${Math.round(age)}세`
}

/** 차트 Y축 라벨 */
export function formatAxisMoney(value: number): string {
  if (value === 0) return '0'
  return formatKRW(value, 'compact')
}

/** 달성률 — 100%를 넘으면 정수, 미달이면 소수 첫째 자리까지 */
export function formatAchievement(ratio: number): string {
  if (!Number.isFinite(ratio)) return '—'
  const pct = ratio * 100
  if (pct >= 1000) return '1,000%+'
  return `${pct.toFixed(pct >= 100 ? 0 : 1)}%`
}

/** CSV 셀 이스케이프 */
export function csvCell(value: string | number): string {
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
