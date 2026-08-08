/**
 * 단위 테스트 — format.ts (design/07-test-plan.md §4)
 * 한국 사용자는 1,234,560,000 을 즉시 읽지 못한다. 억/만원 표기가 필수다.
 */

import { describe, expect, it } from 'vitest'
import {
  csvCell,
  formatAchievement,
  formatAxisMoney,
  formatKRW,
  formatMoneyHint,
  formatPercent,
  formatSignedPercent,
} from '@/lib/format'

describe('formatKRW — 기본 모드', () => {
  const cases: [number, string][] = [
    [0, '0원'],
    [9_999, '9,999원'],
    [10_000, '1만원'],
    [3_000_000, '300만원'],
    [99_999_999, '9,999만원'],
    [100_000_000, '1억원'],
    [1_234_560_000, '12억 3,456만원'],
    [-5_000_000, '-500만원'],
    [1_000_000_000_000, '1조원'],
    [1_234_000_000_000, '1조 2,340억원'],
  ]

  for (const [input, expected] of cases) {
    it(`${input} → ${expected}`, () => {
      expect(formatKRW(input)).toBe(expected)
    })
  }

  it('만원 미만 단위는 절사한다', () => {
    expect(formatKRW(123_456_789)).toBe('1억 2,345만원')
  })

  it('유한하지 않은 값은 —', () => {
    expect(formatKRW(NaN)).toBe('—')
    expect(formatKRW(Infinity)).toBe('—')
  })
})

describe('formatKRW — compact / exact', () => {
  it('compact: 차트 축·좁은 카드용', () => {
    expect(formatKRW(1_234_560_000, 'compact')).toBe('12.3억')
    expect(formatKRW(350_000_000, 'compact')).toBe('3.50억')
    expect(formatKRW(30_000_000, 'compact')).toBe('3,000만')
  })

  it('exact: 상세 표·CSV용', () => {
    expect(formatKRW(1_200_000_000, 'exact')).toBe('1,200,000,000원')
    expect(formatKRW(-1_200_000_000, 'exact')).toBe('-1,200,000,000원')
  })

  it('축 라벨의 0은 0으로 표시', () => {
    expect(formatAxisMoney(0)).toBe('0')
  })
})

describe('formatMoneyHint — 0 하나 차이 오타 방지', () => {
  it('입력값을 한국식으로 즉시 보여준다', () => {
    expect(formatMoneyHint(3_000_000)).toBe('→ 300만원')
    expect(formatMoneyHint(30_000_000)).toBe('→ 3,000만원')
  })

  it('0이면 힌트를 보여주지 않는다', () => {
    expect(formatMoneyHint(0)).toBe('')
  })
})

describe('formatPercent', () => {
  it('소수를 퍼센트로', () => {
    expect(formatPercent(0.07)).toBe('7.00%')
    expect(formatPercent(0.0015)).toBe('0.15%')
    expect(formatPercent(0.154, 1)).toBe('15.4%')
  })

  it('부호 표기', () => {
    expect(formatSignedPercent(0.02)).toBe('+2.00%')
    expect(formatSignedPercent(-0.02)).toBe('-2.00%')
  })
})

describe('formatAchievement', () => {
  it('100% 이상은 정수, 미달은 소수 첫째 자리', () => {
    expect(formatAchievement(1.234)).toBe('123%')
    expect(formatAchievement(0.957)).toBe('95.7%')
  })

  it('극단값은 상한 표기', () => {
    expect(formatAchievement(50)).toBe('1,000%+')
  })
})

describe('csvCell', () => {
  it('쉼표·따옴표·개행이 있으면 감싼다', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('a"b')).toBe('"a""b"')
    expect(csvCell('일반')).toBe('일반')
    expect(csvCell(1234)).toBe('1234')
  })
})
