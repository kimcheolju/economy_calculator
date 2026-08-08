/**
 * 속성 테스트 P-1 ~ P-15 (design/07-test-plan.md §3)
 *
 * 무작위 입력에 대해 항상 성립해야 하는 불변식.
 * 생성기는 시드 PRNG를 쓰므로 실패를 재현할 수 있다.
 */

import { describe, expect, it } from 'vitest'
import { accumulate } from '@/calc/accumulate'
import { allocateYear, createLimitState } from '@/calc/allocate'
import { netNominalReturn, normalizeReturns } from '@/calc/rates'
import { runFullSimulation } from '@/calc/index'
import { withdraw } from '@/calc/withdraw'
import { mulberry32, type Prng } from '@/lib/prng'
import type { CalculatorInput, EtfKind, WithdrawalStrategy } from '@/calc/types'
import { RULES, makeAccounts, makeInput, taxFreeRules } from '../helpers'

const CASES = 200
const FREE = taxFreeRules()

function pick<T>(prng: Prng, items: readonly T[]): T {
  return items[Math.floor(prng.next() * items.length)] as T
}

function range(prng: Prng, min: number, max: number): number {
  return min + prng.next() * (max - min)
}

function intRange(prng: Prng, min: number, max: number): number {
  return Math.floor(range(prng, min, max + 1))
}

/**
 * 무작위 입력 생성기.
 * 범위는 현실적인 값으로 제한한다 — 극단값에서는 일부 불변식이 의미를 잃는다
 * (예: 인출률 10% + 수익률 −5% + 90년이면 고정비율 인출도 1원 미만으로 수렴한다).
 */
function randomInput(prng: Prng): CalculatorInput {
  const currentAge = intRange(prng, 25, 55)
  const retirementAge = currentAge + intRange(prng, 5, 30)
  const endAge = retirementAge + intRange(prng, 10, 40)

  const dividendYield = range(prng, 0, 0.03)
  const totalReturn = dividendYield + range(prng, 0.005, 0.1)

  return makeInput({
    basic: {
      currentAge,
      retirementAge,
      endAge,
      salaryBracket: pick(prng, ['under55m', 'over55m'] as const),
      isaType: pick(prng, ['general', 'lowIncome'] as const),
    },
    returns: {
      mode: 'totalReturn',
      totalReturn,
      dividendYield,
      inflation: range(prng, 0, 0.04),
      ter: range(prng, 0, 0.01),
      retirementReturn: range(prng, 0.005, 0.08),
      reinvestDividends: prng.next() > 0.2,
      contributionTiming: pick(prng, ['begin', 'end'] as const),
      volatility: 0.15,
    },
    accounts: {
      monthlyContribution: Math.round(range(prng, 0, 5_000_000)),
      contributionGrowthRate: range(prng, 0, 0.08),
      initialBalances: {
        taxable: Math.round(range(prng, 0, 200_000_000)),
        isa: Math.round(range(prng, 0, 100_000_000)),
        pensionSavings: Math.round(range(prng, 0, 100_000_000)),
        irp: Math.round(range(prng, 0, 50_000_000)),
        dcRetirement: Math.round(range(prng, 0, 50_000_000)),
      },
      etfKind: pick(prng, ['domesticEquity', 'domesticListedForeign', 'foreignListed'] as const satisfies readonly EtfKind[]),
      reinvestTaxCredit: prng.next() > 0.3,
    },
    retirement: {
      targetMonthlySpendToday: Math.round(range(prng, 1_000_000, 8_000_000)),
      strategy: pick(prng, ['fixedReal', 'fixedPercent', 'depletion', 'vpw'] as const satisfies readonly WithdrawalStrategy[]),
      withdrawalRate: range(prng, 0.02, 0.06),
      nationalPension: {
        monthlyAmountToday: Math.round(range(prng, 0, 2_000_000)),
        startAge: intRange(prng, 60, 70),
      },
      healthInsurance: { mode: pick(prng, ['none', 'rateApprox'] as const) },
    },
  })
}

function inputs(seed: number, count = CASES): CalculatorInput[] {
  const prng = mulberry32(seed)
  return Array.from({ length: count }, () => randomInput(prng))
}

function runAcc(input: CalculatorInput, rules = RULES) {
  return accumulate(input, normalizeReturns(input.returns), rules)
}

describe('P-1. 보수 차감 후 수익률 ≥ 0 이면 총자산 ≥ 총납입원금', () => {
  it('모든 무작위 입력에서 성립', () => {
    let checked = 0
    for (const input of inputs(1)) {
      // 배당 미재투자 시 배당이 자산에서 빠지므로 제외한다
      if (!input.returns.reinvestDividends) continue
      // TER가 총수익률보다 크면 순수익률이 음수가 되어 원금이 잠식되는 것이 정상이다
      if (netNominalReturn(input.returns.totalReturn, input.returns.ter) < 0) continue
      const result = runAcc(input)
      expect(result.finalBalance.nominal).toBeGreaterThanOrEqual(result.totalPrincipal - 1)
      checked += 1
    }
    expect(checked).toBeGreaterThan(50)
  })

  it('반대로 TER가 총수익률을 넘으면 원금이 잠식된다 (정상 동작)', () => {
    const input = makeInput({
      basic: { currentAge: 35, retirementAge: 65 },
      returns: { mode: 'totalReturn', totalReturn: 0.005, dividendYield: 0, ter: 0.01, inflation: 0 },
      accounts: { monthlyContribution: 1_000_000, contributionGrowthRate: 0, reinvestTaxCredit: false },
    })
    const result = runAcc(input, FREE)
    expect(result.finalBalance.nominal).toBeLessThan(result.totalPrincipal)
  })
})

describe('P-2. 수익률을 올리면 최종자산이 단조 증가', () => {
  it('모든 무작위 입력에서 성립', () => {
    for (const input of inputs(2, 100)) {
      const lower = runAcc(input).finalBalance.nominal
      const higher = runAcc({
        ...input,
        returns: { ...input.returns, totalReturn: input.returns.totalReturn + 0.01 },
      }).finalBalance.nominal
      expect(higher).toBeGreaterThan(lower - 1e-6)
    }
  })
})

describe('P-3. TER를 올리면 최종자산이 단조 감소', () => {
  it('모든 무작위 입력에서 성립', () => {
    for (const input of inputs(3, 100)) {
      const low = runAcc(input).finalBalance.nominal
      const high = runAcc({ ...input, returns: { ...input.returns, ter: input.returns.ter + 0.005 } })
        .finalBalance.nominal
      expect(high).toBeLessThanOrEqual(low + 1e-6)
    }
  })
})

describe('P-4/P-5. 물가상승률은 실질값만 바꾸고 명목값에 영향이 없다', () => {
  it('물가를 올리면 실질 최종자산이 감소하고 명목은 불변', () => {
    for (const input of inputs(4, 100)) {
      const base = runAcc(input)
      const higher = runAcc({ ...input, returns: { ...input.returns, inflation: input.returns.inflation + 0.01 } })
      expect(higher.finalBalance.nominal).toBeCloseTo(base.finalBalance.nominal, 4)
      if (input.basic.retirementAge > input.basic.currentAge) {
        expect(higher.finalBalance.real).toBeLessThan(base.finalBalance.real + 1e-6)
      }
    }
  })
})

describe('P-6. 과세 계좌 결과 ≤ 세금 없는 동일 조건 결과', () => {
  it('모든 무작위 입력에서 성립', () => {
    for (const input of inputs(6, 100)) {
      // 세액공제 환급금 재투자는 세율에 비례하므로 끄고 비교한다
      const noCredit = { ...input, accounts: { ...input.accounts, reinvestTaxCredit: false } }
      const taxed = runAcc(noCredit, RULES).finalBalance.nominal
      const free = runAcc(noCredit, FREE).finalBalance.nominal
      expect(taxed).toBeLessThanOrEqual(free + 1e-6)
    }
  })
})

describe('P-7. 인출률을 올리면 고갈 시점이 앞당겨진다', () => {
  it('고정 실질 인출에서 성립', () => {
    for (const input of inputs(7, 60)) {
      const fixedReal: CalculatorInput = {
        ...input,
        retirement: { ...input.retirement, strategy: 'fixedReal', withdrawalRate: 0.035 },
      }
      const accounts = makeAccounts({ taxable: 1_000_000_000 }, { gainRatio: 0.4 })
      const low = withdraw(accounts, fixedReal, RULES).depletionAge ?? Number.POSITIVE_INFINITY
      const high =
        withdraw(accounts, { ...fixedReal, retirement: { ...fixedReal.retirement, withdrawalRate: 0.06 } }, RULES)
          .depletionAge ?? Number.POSITIVE_INFINITY
      expect(high).toBeLessThanOrEqual(low)
    }
  })
})

describe('P-8. 고정 비율 인출은 고갈되지 않는다', () => {
  it('모든 무작위 입력에서 depletionAge 가 null', () => {
    for (const input of inputs(8, 100)) {
      const percent: CalculatorInput = {
        ...input,
        retirement: { ...input.retirement, strategy: 'fixedPercent' },
      }
      const result = withdraw(makeAccounts({ taxable: 1_000_000_000 }, { gainRatio: 0.4 }), percent, RULES)
      expect(result.depletionAge).toBeNull()
    }
  })
})

describe('P-9. 계좌 배분 합계 = 총 납입액', () => {
  it('모든 무작위 입력에서 오차 0.01원 이내', () => {
    const prng = mulberry32(9)
    for (let i = 0; i < CASES; i++) {
      const input = randomInput(prng)
      const annual = input.accounts.monthlyContribution * 12
      const limits = createLimitState()
      const { allocation } = allocateYear(annual, input.accounts, RULES, limits)
      const sum = Object.values(allocation).reduce((a, b) => a + b, 0)
      expect(Math.abs(sum - annual)).toBeLessThan(0.01)
    }
  })
})

describe('P-10. 월 납입액을 올리면 달성률이 단조 증가', () => {
  it('모든 무작위 입력에서 성립', () => {
    for (const input of inputs(10, 40)) {
      const low = runFullSimulation(input, RULES).fire.achievementBySpend
      const high = runFullSimulation(
        { ...input, accounts: { ...input.accounts, monthlyContribution: input.accounts.monthlyContribution + 1_000_000 } },
        RULES,
      ).fire.achievementBySpend
      expect(high).toBeGreaterThanOrEqual(low - 1e-9)
    }
  })
})

describe('P-11. 실질 × (1+i)^Y = 명목', () => {
  it('모든 무작위 입력에서 오차 0.001% 이내', () => {
    for (const input of inputs(11)) {
      const result = runAcc(input)
      const years = input.basic.retirementAge - input.basic.currentAge
      const restored = result.finalBalance.real * Math.pow(1 + input.returns.inflation, years)
      const denominator = Math.max(1, Math.abs(result.finalBalance.nominal))
      expect(Math.abs(restored - result.finalBalance.nominal) / denominator).toBeLessThan(1e-5)
    }
  })
})

describe('P-12. 모든 금액 출력이 유한값 (NaN/Infinity 없음)', () => {
  it('전체 파이프라인의 모든 숫자가 유한하다', () => {
    for (const input of inputs(12, 80)) {
      const result = runFullSimulation(input, RULES)
      const numbers: number[] = [
        result.accumulation.finalBalance.nominal,
        result.accumulation.finalBalance.real,
        result.accumulation.totalPrincipal,
        result.accumulation.totalGain,
        result.accumulation.totalTaxPaid,
        result.withdrawal.firstYearMonthlyNet.nominal,
        result.withdrawal.firstYearMonthlyNet.real,
        result.withdrawal.totalTaxPaid,
        result.withdrawal.totalInsurancePaid,
        result.fire.achievementBySpend,
        result.fire.achievementByAsset,
        result.fire.grossNeededAtRetirement,
      ]
      for (const snap of result.accumulation.snapshots) {
        numbers.push(snap.balance.nominal, snap.balance.real, snap.cumulativeGain, snap.taxPaid)
      }
      for (const row of result.withdrawal.rows) {
        numbers.push(row.grossWithdrawal, row.netIncome.nominal, row.netIncome.real, row.endingBalance.nominal)
      }
      for (const row of result.fire.comparison) {
        numbers.push(row.requiredAssets.nominal, row.monthlyNet.nominal, row.shortfall)
      }

      for (const value of numbers) {
        expect(Number.isFinite(value)).toBe(true)
      }
    }
  })
})

describe('P-13. costBasis ≤ balance (평가손실이 없는 조건)', () => {
  /**
   * 평가이익이 생기려면 **가격상승분이 보수를 상회**해야 한다.
   * 재투자된 배당은 전액 취득원가에 가산되므로, 배당이 커도 평가이익을 만들지 않는다.
   * (1+price)(1−ter) < 1 이면 재투자를 반복해도 평가손실이 남는 것이 정상이다.
   */
  it('가격상승분이 보수를 상회하는 입력에서 성립', () => {
    let checked = 0
    for (const input of inputs(13, 100)) {
      const normalized = normalizeReturns(input.returns)
      if ((1 + normalized.priceReturn) * (1 - input.returns.ter) < 1) continue
      const result = runAcc(input)
      for (const account of Object.values(result.finalAccounts)) {
        expect(account.costBasis).toBeLessThanOrEqual(account.balance + 1e-6)
      }
      checked += 1
    }
    expect(checked).toBeGreaterThan(50)
  })

  it('가격상승분이 보수보다 작으면 평가손실이 남는다 (정상 동작)', () => {
    const input = makeInput({
      basic: { currentAge: 35, retirementAge: 65 },
      returns: { mode: 'split', priceReturn: 0.002, dividendYield: 0.03, ter: 0.01, inflation: 0 },
      accounts: {
        monthlyContribution: 0,
        contributionGrowthRate: 0,
        reinvestTaxCredit: false,
        initialBalances: { taxable: 0, isa: 100_000_000, pensionSavings: 0, irp: 0, dcRetirement: 0 },
      },
    })
    const result = runAcc(input, FREE)
    expect(result.finalAccounts.isa.costBasis).toBeGreaterThan(result.finalAccounts.isa.balance)
    // 그럼에도 총자산은 증가한다 (배당 재투자 효과)
    expect(result.finalAccounts.isa.balance).toBeGreaterThan(100_000_000)
  })
})

describe('P-14. 은퇴 나이를 늦추면 최종자산이 증가', () => {
  it('모든 무작위 입력에서 성립', () => {
    for (const input of inputs(14, 80)) {
      const early = runAcc(input).finalBalance.nominal
      const late = runAcc({
        ...input,
        basic: { ...input.basic, retirementAge: input.basic.retirementAge + 3 },
      }).finalBalance.nominal
      expect(late).toBeGreaterThanOrEqual(early - 1e-6)
    }
  })
})

describe('P-15. 솔버 결과를 입력에 대입하면 달성률 ≈ 100%', () => {
  it('필요 월 납입액 솔버의 왕복이 성립한다', async () => {
    const { solveMonthlyContribution } = await import('@/calc/solve')
    for (const input of inputs(15, 12)) {
      const solved = solveMonthlyContribution(input, RULES)
      if (solved.value === null || solved.value === 0) continue
      const applied = runFullSimulation(
        { ...input, accounts: { ...input.accounts, monthlyContribution: solved.value } },
        RULES,
      )
      expect(Math.abs(applied.fire.achievementBySpend - 1)).toBeLessThan(0.005)
    }
  })
})
