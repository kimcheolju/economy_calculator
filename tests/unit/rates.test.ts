/**
 * 단위 테스트 — rates.ts (design/07-test-plan.md §4)
 */

import { describe, expect, it } from 'vitest'
import {
  annuityDuePaymentFactor,
  annuityDuePresentValueFactor,
  monthlyDividendYield,
  monthlyFeeFactor,
  monthlyFromAnnual,
  netNominalReturn,
  normalizeReturns,
  realReturn,
  toNominal,
  toReal,
} from '@/calc/rates'

describe('monthlyFromAnnual', () => {
  it('연 0% → 월 0%', () => {
    expect(monthlyFromAnnual(0)).toBe(0)
  })

  it('12개월 복리하면 연 수익률로 복원된다', () => {
    for (const annual of [-0.3, -0.05, 0, 0.03, 0.07, 0.2]) {
      expect(Math.pow(1 + monthlyFromAnnual(annual), 12) - 1).toBeCloseTo(annual, 12)
    }
  })

  it('r ≤ -1 에서도 NaN 이 아니다 (하한 클램프)', () => {
    expect(Number.isFinite(monthlyFromAnnual(-1))).toBe(true)
    expect(Number.isFinite(monthlyFromAnnual(-2))).toBe(true)
  })

  it('r/12 보다 작다 (기하평균 < 산술평균)', () => {
    expect(monthlyFromAnnual(0.07)).toBeLessThan(0.07 / 12)
  })
})

describe('monthlyDividendYield', () => {
  it('연 배당수익률을 12로 안분한다', () => {
    expect(monthlyDividendYield(0.024)).toBeCloseTo(0.002, 12)
  })
})

describe('monthlyFeeFactor', () => {
  it('TER 0% → 배율 1', () => {
    expect(monthlyFeeFactor(0)).toBe(1)
  })

  it('12개월 곱하면 (1 − TER) 이 된다', () => {
    expect(Math.pow(monthlyFeeFactor(0.005), 12)).toBeCloseTo(0.995, 12)
  })

  it('음수 TER 은 0으로 클램프된다', () => {
    expect(monthlyFeeFactor(-0.1)).toBe(1)
  })
})

describe('netNominalReturn', () => {
  it('TER 0 이면 총수익률과 같다', () => {
    expect(netNominalReturn(0.07, 0)).toBeCloseTo(0.07, 12)
  })

  it('단순 차감(r − f)보다 약간 작다', () => {
    expect(netNominalReturn(0.07, 0.005)).toBeLessThan(0.07 - 0.005)
  })
})

describe('realReturn', () => {
  it('물가 0 이면 명목과 같다', () => {
    expect(realReturn(0.07, 0)).toBeCloseTo(0.07, 12)
  })

  it('명목 = 물가면 실질 0', () => {
    expect(realReturn(0.03, 0.03)).toBeCloseTo(0, 12)
  })

  it('명목 < 물가면 실질이 음수', () => {
    expect(realReturn(0.01, 0.03)).toBeLessThan(0)
  })
})

describe('toReal / toNominal 왕복', () => {
  it('환산 후 역환산하면 원래 값', () => {
    for (const years of [0, 1, 10, 30, 60]) {
      expect(toNominal(toReal(1_000_000_000, 0.02, years), 0.02, years)).toBeCloseTo(1_000_000_000, 4)
    }
  })

  it('years = 0 이면 그대로', () => {
    expect(toReal(123_456, 0.02, 0)).toBe(123_456)
  })
})

describe('normalizeReturns — 배당 중복 가산 방지 (원안 19행)', () => {
  it('Total Return 모드: 총수익률을 가격상승률 + 배당수익률로 분해한다', () => {
    const r = normalizeReturns({ mode: 'totalReturn', totalReturn: 0.07, priceReturn: 0, dividendYield: 0.015 })
    expect(r.totalReturn).toBeCloseTo(0.07, 12)
    expect(r.priceReturn).toBeCloseTo(0.055, 12)
    expect(r.dividendYield).toBeCloseTo(0.015, 12)
  })

  it('분리 모드: 가격상승률 + 배당수익률 = 총수익률', () => {
    const r = normalizeReturns({ mode: 'split', totalReturn: 0, priceReturn: 0.055, dividendYield: 0.015 })
    expect(r.totalReturn).toBeCloseTo(0.07, 12)
  })

  it('두 모드가 동일한 내부 표현으로 수렴한다', () => {
    const a = normalizeReturns({ mode: 'totalReturn', totalReturn: 0.07, priceReturn: 0, dividendYield: 0.015 })
    const b = normalizeReturns({ mode: 'split', totalReturn: 0, priceReturn: 0.055, dividendYield: 0.015 })
    // 부동소수점 1 ULP 차이(0.07 − 0.015 = 0.055000000000000004)는 허용한다
    expect(a.priceReturn).toBeCloseTo(b.priceReturn, 12)
    expect(a.dividendYield).toBeCloseTo(b.dividendYield, 12)
    expect(a.totalReturn).toBeCloseTo(b.totalReturn, 12)
  })

  it('항등식 totalReturn = priceReturn + dividendYield 이 항상 성립한다', () => {
    for (const total of [0, 0.02, 0.07, 0.15]) {
      for (const div of [0, 0.01, 0.03]) {
        const r = normalizeReturns({ mode: 'totalReturn', totalReturn: total, priceReturn: 0, dividendYield: div })
        expect(r.priceReturn + r.dividendYield).toBeCloseTo(r.totalReturn, 12)
      }
    }
  })

  it('음수 배당수익률은 0으로 클램프된다', () => {
    const r = normalizeReturns({ mode: 'totalReturn', totalReturn: 0.07, priceReturn: 0, dividendYield: -0.01 })
    expect(r.dividendYield).toBe(0)
  })
})

describe('연금현가 계수', () => {
  it('rate = 0 이면 현가 계수 = 연수', () => {
    expect(annuityDuePresentValueFactor(0, 30)).toBe(30)
    expect(annuityDuePaymentFactor(0, 30)).toBeCloseTo(1 / 30, 12)
  })

  it('rate ≈ 0 근처에서 폴백이 동작한다', () => {
    expect(annuityDuePresentValueFactor(1e-12, 30)).toBe(30)
  })

  it('현가 계수와 상환 계수는 역수 관계', () => {
    for (const rate of [0.01, 0.02, 0.05]) {
      for (const years of [10, 30, 50]) {
        expect(annuityDuePresentValueFactor(rate, years) * annuityDuePaymentFactor(rate, years)).toBeCloseTo(1, 12)
      }
    }
  })

  it('years = 0 이면 0', () => {
    expect(annuityDuePresentValueFactor(0.02, 0)).toBe(0)
    expect(annuityDuePaymentFactor(0.02, 0)).toBe(0)
  })

  it('실질수익률이 음수면 현가가 커진다 (필요자산 증가)', () => {
    expect(annuityDuePresentValueFactor(-0.01, 30)).toBeGreaterThan(annuityDuePresentValueFactor(0.01, 30))
  })
})
