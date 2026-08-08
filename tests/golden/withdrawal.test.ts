/**
 * 골든 테스트 G-7, G-8, G-13, G-14 (design/07-test-plan.md §2)
 *
 * ⚠ 기대값은 독립 계산으로 검증된 값이다. 임의로 수정하지 말 것.
 */

import { describe, expect, it } from 'vitest'
import { withdraw, buildPhases } from '@/calc/withdraw'
import { annuityDuePaymentFactor } from '@/calc/rates'
import { extractComposition, netFromGross, solveGross } from '@/calc/fire'
import { RULES, makeAccounts, makeInput, taxFreeRules } from '../helpers'

const FREE = taxFreeRules()

describe('G-7. 고정 실질 인출 — 정확한 소진', () => {
  const input = makeInput({
    basic: { currentAge: 54, retirementAge: 55, endAge: 95 },
    returns: { inflation: 0.02, retirementReturn: 0.02 }, // 실질 수익률 0
    retirement: {
      strategy: 'fixedReal',
      withdrawalRate: 0.04,
      nationalPension: { monthlyAmountToday: 0 },
      healthInsurance: { mode: 'none' },
    },
  })

  const result = withdraw(makeAccounts({ taxable: 1_000_000_000 }), input, FREE)

  it('첫해 인출액 = 10억 × 4% = 4천만원', () => {
    expect(result.rows[0]?.grossWithdrawal).toBeCloseTo(40_000_000, 0)
  })

  it('정확히 25년 후(79세)에 자산이 고갈된다', () => {
    // 1e9 / 4e7 = 25회 인출 → 55세부터 25번째는 79세
    expect(result.depletionAge).toBe(79)
  })

  it('인출액은 매년 물가상승률만큼만 증가한다 (잔액과 무관)', () => {
    const first = result.rows[0]?.grossWithdrawal ?? 0
    const fifth = result.rows[4]?.grossWithdrawal ?? 0
    expect(fifth / first).toBeCloseTo(Math.pow(1.02, 4), 8)
  })

  it('실질 인출액은 일정하다 — 생활수준 유지', () => {
    const reals = result.rows.slice(0, 10).map((r) => r.netIncome.real)
    for (const value of reals) expect(value).toBeCloseTo(reals[0] as number, 0)
  })
})

describe('G-8. 계획 소진형 — 잔액 0 수렴', () => {
  const input = makeInput({
    basic: { currentAge: 54, retirementAge: 55, endAge: 84 }, // n = 30
    returns: { inflation: 0, retirementReturn: 0.02 }, // 실질 2%
    retirement: {
      strategy: 'depletion',
      nationalPension: { monthlyAmountToday: 0 },
      healthInsurance: { mode: 'none' },
    },
  })

  const result = withdraw(makeAccounts({ taxable: 1_000_000_000 }), input, FREE)

  it('연 인출액 = 43,774,433.62원', () => {
    expect(result.rows[0]?.grossWithdrawal).toBeCloseTo(43_774_433.62, 0)
  })

  it('월 인출액 = 3,647,869.47원', () => {
    expect(result.firstYearMonthlyGross).toBeCloseTo(3_647_869.47, 0)
  })

  it('연금현가 계수와 일치한다', () => {
    const expected = 1_000_000_000 * annuityDuePaymentFactor(0.02, 30)
    expect(result.rows[0]?.grossWithdrawal).toBeCloseTo(expected, 6)
  })

  it('30년 후 잔액이 0으로 수렴한다', () => {
    const last = result.rows[result.rows.length - 1]
    expect(last?.age).toBe(84)
    expect(Math.abs(last?.endingBalance.nominal ?? 0)).toBeLessThan(1)
  })

  it('실질 수익률 0 근처에서도 폴백이 동작한다', () => {
    const zeroInput = makeInput({
      basic: { currentAge: 54, retirementAge: 55, endAge: 84 },
      returns: { inflation: 0.02, retirementReturn: 0.02 },
      retirement: {
        strategy: 'depletion',
        nationalPension: { monthlyAmountToday: 0 },
        healthInsurance: { mode: 'none' },
      },
    })
    const r = withdraw(makeAccounts({ taxable: 1_000_000_000 }), zeroInput, FREE)
    // 실질수익률 0, 30년 → 연 1/30 = 33,333,333원
    expect(r.rows[0]?.grossWithdrawal).toBeCloseTo(1_000_000_000 / 30, 0)
  })
})

describe('G-13. 브리지 기간 제약 (검토판 §2.4)', () => {
  const input = makeInput({
    basic: { currentAge: 40, retirementAge: 50, endAge: 95 },
    retirement: {
      nationalPension: { monthlyAmountToday: 1_500_000, startAge: 65 },
      healthInsurance: { mode: 'none' },
    },
  })

  it('구간이 브리지1 / 브리지2 / 연금 수령기로 나뉜다', () => {
    const phases = buildPhases(input, RULES)
    expect(phases.map((p) => [p.name, p.fromAge, p.toAge])).toEqual([
      ['브리지 1', 50, 54],
      ['브리지 2', 55, 64],
      ['연금 수령기', 65, 95],
    ])
  })

  it('55세 미만 구간에서는 연금저축·IRP가 인출되지 않는다', () => {
    const accounts = makeAccounts({
      taxable: 300_000_000,
      pensionSavings: 300_000_000,
      irp: 200_000_000,
    })
    const result = withdraw(accounts, input, RULES)
    const bridge1 = result.rows.filter((r) => r.age < 55)

    expect(bridge1.length).toBe(5)
    for (const row of bridge1) {
      expect(row.withdrawalByAccount.pensionSavings).toBe(0)
      expect(row.withdrawalByAccount.irp).toBe(0)
    }
  })

  it('55세 이후에는 연금계좌가 인출 재원에 포함된다', () => {
    const accounts = makeAccounts({ taxable: 1_000_000, pensionSavings: 500_000_000 })
    const result = withdraw(accounts, input, RULES)
    const afterBridge = result.rows.filter((r) => r.age >= 55)
    const pensionUsed = afterBridge.some((r) => r.withdrawalByAccount.pensionSavings > 0)
    expect(pensionUsed).toBe(true)
  })

  it('연금소득이 없으면 마지막 구간을 연금 수령기로 부르지 않는다', () => {
    const noPension = makeInput({
      basic: { currentAge: 35, retirementAge: 55, endAge: 95 },
      retirement: {
        nationalPension: { monthlyAmountToday: 0 },
        otherPension: { monthlyAmountToday: 0 },
      },
    })
    const phases = buildPhases(noPension, RULES)
    expect(phases.map((p) => p.name)).toEqual(['자산 인출기'])
    expect(phases[0]?.note).toContain('연금소득 입력이 없어')
  })

  it('기타 연금만 있어도 연금 수령기 구간이 생긴다', () => {
    const otherOnly = makeInput({
      basic: { currentAge: 40, retirementAge: 55, endAge: 95 },
      retirement: {
        nationalPension: { monthlyAmountToday: 0 },
        otherPension: { monthlyAmountToday: 800_000, startAge: 65 },
      },
    })
    const phases = buildPhases(otherOnly, RULES)
    expect(phases.map((p) => [p.name, p.fromAge, p.toAge])).toEqual([
      ['브리지 2', 55, 64],
      ['연금 수령기', 65, 95],
    ])
  })

  it('은퇴 나이가 55세 이상이면 브리지 1이 사라진다', () => {
    const late = makeInput({
      basic: { currentAge: 40, retirementAge: 60, endAge: 95 },
      retirement: { nationalPension: { monthlyAmountToday: 1_500_000, startAge: 65 } },
    })
    const phases = buildPhases(late, RULES)
    expect(phases.map((p) => p.name)).toEqual(['브리지 2', '연금 수령기'])
  })
})

describe('G-14. Gross-up 역산 왕복', () => {
  const input = makeInput({
    basic: { currentAge: 54, retirementAge: 55, endAge: 95 },
    accounts: { etfKind: 'foreignListed' },
    retirement: { healthInsurance: { mode: 'rateApprox' }, nationalPension: { monthlyAmountToday: 0 } },
  })

  // 차익 비율 60%인 일반계좌
  const accounts = makeAccounts({ taxable: 2_000_000_000 }, { gainRatio: 0.6 })

  const ctx = {
    input,
    rules: RULES,
    composition: extractComposition(accounts),
    referenceTotal: 2_000_000_000,
    publicPensionAnnual: 0,
    age: 55,
  }

  it('세후 필요액 5,000만원에 대한 역산 결과를 다시 대입하면 원래 값이 나온다', () => {
    const netNeeded = 50_000_000
    const gross = solveGross(netNeeded, ctx)
    expect(netFromGross(gross, ctx)).toBeCloseTo(netNeeded, -3) // ±1,000원
  })

  it('세전 인출액은 세후 필요액보다 크다', () => {
    const netNeeded = 50_000_000
    expect(solveGross(netNeeded, ctx)).toBeGreaterThan(netNeeded)
  })

  it('세후 필요액이 0이면 0을 반환한다', () => {
    expect(solveGross(0, ctx)).toBe(0)
    expect(netFromGross(0, ctx)).toBe(0)
  })

  it('여러 금액에 대해 왕복이 성립한다', () => {
    for (const netNeeded of [10_000_000, 30_000_000, 80_000_000, 200_000_000]) {
      const gross = solveGross(netNeeded, ctx)
      expect(netFromGross(gross, ctx)).toBeCloseTo(netNeeded, -3)
    }
  })
})
