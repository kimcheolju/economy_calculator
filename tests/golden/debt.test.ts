/**
 * 골든 테스트 — 부채 상환 (design/02-calculation-engine.md §12)
 *
 * ⚠ 기대값은 엑셀 PMT/원리금균등상환 표와 대조한 값이다. 임의로 수정하지 말 것.
 */

import { describe, expect, it } from 'vitest'
import { runFullSimulation } from '@/calc'
import { simulateDebt } from '@/calc/debt'
import { makeInput, RULES } from '../helpers'

describe('G-D1. 원리금균등상환 — 엑셀 대조', () => {
  /*
   * 원금 2억, 연 4.2%(월 0.35%), 30년(360개월) 원리금균등.
   *
   * 기대값은 엔진과 무관하게 PowerShell 로 따로 계산했다:
   *   PMT = P·r·(1+r)^n / ((1+r)^n − 1) = 978,034.347427원
   *   총 상환액 = PMT × 360           = 352,092,365.07원
   *   240개월 후 잔액                  = 95,699,598.46원
   *     (B_k = P(1+r)^k − PMT·((1+r)^k − 1)/r)
   */
  const PRINCIPAL = 200_000_000
  const RATE = 0.042
  const PAYMENT = 978_034.347427

  it('엑셀 PMT 금액으로 갚으면 30년(65세)에 상환이 끝난다', () => {
    const result = simulateDebt(
      { principal: PRINCIPAL, annualRate: RATE, monthlyPayment: PAYMENT, investFreedPayment: false },
      35,
      95,
      95,
    )
    // 35세 + 30년 = 65세
    expect(result.payoffAge).toBe(65)
    expect(result.neverPaysOff).toBe(false)
  })

  it('총 상환액 352,092,365원 · 총 이자 152,092,365원', () => {
    const result = simulateDebt(
      { principal: PRINCIPAL, annualRate: RATE, monthlyPayment: PAYMENT, investFreedPayment: false },
      35,
      95,
      95,
    )
    expect(result.totalPaidDuringAccumulation).toBeCloseTo(352_092_365.07, 0)
    expect(result.interestPaidDuringAccumulation).toBeCloseTo(152_092_365.07, 0)
    // 이자가 원금의 76% — 30년 대출의 실체를 보여주는 수치다
    expect(result.interestPaidDuringAccumulation / PRINCIPAL).toBeCloseTo(0.7605, 3)
  })

  it('20년(55세 은퇴) 시점 잔액은 95,699,598원이다', () => {
    const result = simulateDebt(
      { principal: PRINCIPAL, annualRate: RATE, monthlyPayment: PAYMENT, investFreedPayment: false },
      35,
      55,
      95,
    )
    expect(result.balanceAtRetirement).toBeCloseTo(95_699_598.46, 0)
    // 기간의 2/3(20/30년)가 지났는데 원금은 52%만 갚혔다 —
    // 초기 상환금 대부분이 이자로 나가기 때문이며, 은퇴 시점 잔여 부채가 큰 이유다
    expect(result.balanceAtRetirement / PRINCIPAL).toBeCloseTo(0.4785, 3)
  })

  it('무이자(0%)면 원금 ÷ 월 상환액 개월 만에 끝난다', () => {
    const result = simulateDebt(
      { principal: 12_000_000, annualRate: 0, monthlyPayment: 1_000_000, investFreedPayment: false },
      40,
      95,
      95,
    )
    // 12개월 → 연말 기준 41세
    expect(result.payoffAge).toBe(41)
    expect(result.interestPaidDuringAccumulation).toBe(0)
    expect(result.totalPaidDuringAccumulation).toBeCloseTo(12_000_000, 6)
  })
})

describe('G-D2. 월 상환액이 이자보다 적으면 원금이 줄지 않는다', () => {
  it('neverPaysOff 로 표시하고 잔액이 늘어난다', () => {
    const result = simulateDebt(
      { principal: 100_000_000, annualRate: 0.06, monthlyPayment: 100_000, investFreedPayment: false },
      35,
      55,
      95,
    )
    // 월 이자 50만원 > 월 상환 10만원
    expect(result.neverPaysOff).toBe(true)
    expect(result.payoffAge).toBeNull()
    expect(result.balanceAtRetirement).toBeGreaterThan(100_000_000)
  })
})

describe('G-D3. 상환 완료 후 투자 증액', () => {
  const base = {
    basic: { currentAge: 35, retirementAge: 55, endAge: 95 },
    accounts: { monthlyContribution: 1_000_000, contributionGrowthRate: 0 },
    debt: { principal: 12_000_000, annualRate: 0, monthlyPayment: 1_000_000, investFreedPayment: false },
  }

  it('끄면 납입액이 늘지 않는다', () => {
    const off = runFullSimulation(makeInput(base), RULES)
    const on = runFullSimulation(
      makeInput({ ...base, debt: { ...base.debt, investFreedPayment: true } }),
      RULES,
    )
    // 1년차에 상환이 끝나므로 켠 쪽은 이후 19년간 매달 100만원을 더 넣는다
    expect(on.accumulation.totalPrincipal).toBeGreaterThan(off.accumulation.totalPrincipal)
    expect(on.accumulation.finalBalance.nominal).toBeGreaterThan(off.accumulation.finalBalance.nominal)
  })

  it('부채가 없으면 두 설정의 결과가 같다', () => {
    const noDebt = { ...base, debt: { ...base.debt, principal: 0, monthlyPayment: 0 } }
    const off = runFullSimulation(makeInput(noDebt), RULES)
    const on = runFullSimulation(
      makeInput({ ...noDebt, debt: { ...noDebt.debt, investFreedPayment: true } }),
      RULES,
    )
    expect(on.accumulation.finalBalance.nominal).toBeCloseTo(off.accumulation.finalBalance.nominal, 6)
  })
})

describe('G-D4. 은퇴 시점 잔여 부채는 자산에서 상환된다', () => {
  const withDebt = makeInput({
    basic: { currentAge: 35, retirementAge: 55, endAge: 95 },
    accounts: { monthlyContribution: 1_000_000, initialBalances: { taxable: 100_000_000 } },
    // 은퇴까지 갚지 못하도록 상환액을 낮게 둔다
    debt: { principal: 100_000_000, annualRate: 0.03, monthlyPayment: 300_000, investFreedPayment: false },
  })

  it('부채가 있으면 순자산이 총자산보다 작다', () => {
    const result = runFullSimulation(withDebt, RULES)
    expect(result.debtSettlement.balanceAtRetirement).toBeGreaterThan(0)
    expect(result.debtSettlement.netBalance.nominal).toBeLessThan(
      result.accumulation.finalBalance.nominal,
    )
  })

  it('총자산 − 순자산 = 상환액 + 상환에 든 세금', () => {
    const result = runFullSimulation(withDebt, RULES)
    const consumed = result.accumulation.finalBalance.nominal - result.debtSettlement.netBalance.nominal
    expect(consumed).toBeCloseTo(result.debtSettlement.paid + result.debtSettlement.tax, 4)
  })

  it('부채가 있으면 은퇴 후 월 사용액이 줄어든다', () => {
    const noDebt = makeInput({
      ...JSON.parse(JSON.stringify(withDebt)),
      debt: { principal: 0, annualRate: 0.03, monthlyPayment: 0, investFreedPayment: false },
    })
    const a = runFullSimulation(withDebt, RULES)
    const b = runFullSimulation(noDebt, RULES)
    expect(a.withdrawal.firstYearMonthlyNet.real).toBeLessThan(b.withdrawal.firstYearMonthlyNet.real)
  })

  it('부채 0이면 정산이 일어나지 않는다', () => {
    const result = runFullSimulation(makeInput(), RULES)
    expect(result.debtSettlement.paid).toBe(0)
    expect(result.debtSettlement.tax).toBe(0)
    expect(result.debtSettlement.netBalance.nominal).toBeCloseTo(
      result.accumulation.finalBalance.nominal,
      6,
    )
  })
})
