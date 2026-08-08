/**
 * 단위 테스트 — 경계값·예외 경로 (design/07-test-plan.md §4)
 */

import { describe, expect, it } from 'vitest'
import { accumulate } from '@/calc/accumulate'
import { allocateYear, createLimitState, emptyAllocation } from '@/calc/allocate'
import { runFullSimulation } from '@/calc/index'
import { normalizeReturns } from '@/calc/rates'
import { accessibleAccounts, isAccessible } from '@/calc/draw'
import { pensionAnnualLimit, pensionWithdrawalRate, taxOnWithdrawal } from '@/calc/tax/withdrawal'
import { annualHealthInsurance, assessableIncome, combinedInsuranceRate } from '@/calc/tax/insurance'
import { normalPensionAge, pensionAdjustmentFactor, pensionIncomeAt } from '@/calc/pension'
import { solveEarliestRetirementAge, solveMonthlyContribution, solveRequiredReturn } from '@/calc/solve'
import { applyScenario, runScenarios } from '@/calc/scenario'
import { withdraw } from '@/calc/withdraw'
import { bisect, bisectExpanding } from '@/lib/bisect'
import { RULES, makeAccounts, makeInput, taxFreeRules } from '../helpers'

const FREE = taxFreeRules()

describe('allocate — 경계값', () => {
  it('납입액 0이면 전부 0', () => {
    const limits = createLimitState()
    const { allocation } = allocateYear(0, makeInput().accounts, RULES, limits)
    expect(allocation).toEqual(emptyAllocation())
  })

  it('우선순위가 비어 있으면 전액 일반계좌', () => {
    const plan = { ...makeInput().accounts, allocationPriority: [] }
    const limits = createLimitState()
    const { allocation } = allocateYear(12_000_000, plan, RULES, limits)
    expect(allocation.taxable).toBeCloseTo(12_000_000, 6)
  })

  it('DC·퇴직금 계좌는 신규 납입을 받지 않는다', () => {
    const plan = { ...makeInput().accounts, allocationPriority: ['dcRetirement' as const] }
    const limits = createLimitState()
    const { allocation } = allocateYear(12_000_000, plan, RULES, limits)
    expect(allocation.dcRetirement).toBe(0)
    expect(allocation.taxable).toBeCloseTo(12_000_000, 6)
  })

  it('수동 배분: 한도 초과분은 일반계좌로 넘어간다', () => {
    const plan = {
      ...makeInput().accounts,
      allocationMode: 'manual' as const,
      manualAllocation: {
        taxable: 0,
        isa: 0,
        pensionSavings: 2_000_000, // 연 2,400만원 → 한도 1,800만원 초과
        irp: 0,
        dcRetirement: 0,
      },
    }
    const limits = createLimitState()
    const { allocation, deducted } = allocateYear(24_000_000, plan, RULES, limits)
    expect(allocation.pensionSavings).toBeCloseTo(18_000_000, 6)
    expect(allocation.taxable).toBeCloseTo(6_000_000, 6)
    expect(deducted.pensionSavings).toBeCloseTo(6_000_000, 6)
  })
})

describe('accumulate — 경계값', () => {
  it('투자 기간 0이면 초기 자산이 그대로 유지된다', () => {
    const input = makeInput({
      basic: { currentAge: 55, retirementAge: 55 },
      accounts: { initialBalances: { taxable: 100_000_000 } },
    })
    const result = accumulate(input, normalizeReturns(input.returns), RULES)
    expect(result.snapshots.length).toBe(0)
    expect(result.finalBalance.nominal).toBe(100_000_000)
  })

  it('납입액 0, 초기 자산 0이면 결과가 0', () => {
    const input = makeInput({ accounts: { monthlyContribution: 0 } })
    const result = accumulate(input, normalizeReturns(input.returns), RULES)
    expect(result.finalBalance.nominal).toBe(0)
    expect(result.totalPrincipal).toBe(0)
  })

  it('일회성 유입 이벤트가 자산과 원금에 반영된다', () => {
    const input = makeInput({
      basic: { currentAge: 50, retirementAge: 55 },
      returns: { inflation: 0, dividendYield: 0, ter: 0, totalReturn: 0 },
      accounts: { monthlyContribution: 0, contributionGrowthRate: 0, reinvestTaxCredit: false },
      events: [{ id: 'e1', label: '퇴직금', age: 52, amount: 100_000_000, direction: 'inflow', basis: 'nominal' }],
    })
    const result = accumulate(input, normalizeReturns(input.returns), FREE)
    expect(result.finalBalance.nominal).toBeCloseTo(100_000_000, 0)
    expect(result.totalPrincipal).toBeCloseTo(100_000_000, 0)
  })

  it('일회성 유출 이벤트가 자산을 줄인다', () => {
    const input = makeInput({
      basic: { currentAge: 50, retirementAge: 55 },
      returns: { inflation: 0, dividendYield: 0, ter: 0, totalReturn: 0 },
      accounts: {
        monthlyContribution: 0,
        contributionGrowthRate: 0,
        reinvestTaxCredit: false,
        initialBalances: { taxable: 200_000_000 },
      },
      events: [{ id: 'e1', label: '주택 구입', age: 52, amount: 100_000_000, direction: 'outflow', basis: 'nominal' }],
    })
    const result = accumulate(input, normalizeReturns(input.returns), FREE)
    expect(result.finalBalance.nominal).toBeCloseTo(100_000_000, 0)
  })

  it('실질 기준 이벤트는 해당 나이 시점 명목으로 환산된다', () => {
    const base = {
      basic: { currentAge: 50, retirementAge: 55 },
      returns: { inflation: 0.02, dividendYield: 0, ter: 0, totalReturn: 0 },
      accounts: { monthlyContribution: 0, contributionGrowthRate: 0, reinvestTaxCredit: false },
    }
    const realEvent = makeInput({
      ...base,
      events: [{ id: 'e1', label: '유입', age: 52, amount: 100_000_000, direction: 'inflow', basis: 'real' }],
    })
    const result = accumulate(realEvent, normalizeReturns(realEvent.returns), FREE)
    // 2년 후 명목 = 1억 × 1.02^2
    expect(result.finalBalance.nominal).toBeCloseTo(100_000_000 * Math.pow(1.02, 2), 0)
  })

  it('배당 미재투자면 자산에 반영되지 않고 별도로 집계된다', () => {
    const input = makeInput({
      basic: { currentAge: 50, retirementAge: 55 },
      returns: { inflation: 0, totalReturn: 0.05, dividendYield: 0.05, ter: 0, reinvestDividends: false },
      accounts: {
        monthlyContribution: 0,
        contributionGrowthRate: 0,
        reinvestTaxCredit: false,
        initialBalances: { taxable: 100_000_000 },
      },
    })
    const result = accumulate(input, normalizeReturns(input.returns), FREE)
    expect(result.totalDividendCashOut).toBeGreaterThan(0)
    // 가격상승률 0 → 자산은 그대로
    expect(result.finalBalance.nominal).toBeCloseTo(100_000_000, 0)
  })

  it('주요 시점 스냅샷은 투자 기간을 넘지 않는다', () => {
    const input = makeInput({ basic: { currentAge: 50, retirementAge: 57 } })
    const result = accumulate(input, normalizeReturns(input.returns), RULES)
    expect(result.milestones.map((m) => m.yearsFromNow)).toEqual([5, 7])
  })

  it('은퇴 시점이 주요 시점과 겹쳐도 중복되지 않는다', () => {
    // 투자 기간이 정확히 20년이면 '20년 후'와 '은퇴 시점'이 같다
    const input = makeInput({ basic: { currentAge: 35, retirementAge: 55 } })
    const result = accumulate(input, normalizeReturns(input.returns), RULES)
    const years = result.milestones.map((m) => m.yearsFromNow)
    expect(years).toEqual([...new Set(years)])
    expect(years).toEqual([5, 10, 15, 20])
  })
})

describe('draw — 연금계좌 55세 제약', () => {
  it('54세에는 연금계좌 접근 불가', () => {
    expect(isAccessible('pensionSavings', 54, RULES)).toBe(false)
    expect(isAccessible('irp', 54, RULES)).toBe(false)
    expect(isAccessible('dcRetirement', 54, RULES)).toBe(false)
    expect(isAccessible('taxable', 54, RULES)).toBe(true)
    expect(isAccessible('isa', 54, RULES)).toBe(true)
  })

  it('55세부터 전 계좌 접근 가능', () => {
    expect(accessibleAccounts(55, RULES)).toHaveLength(5)
    expect(accessibleAccounts(54, RULES)).toEqual(['taxable', 'isa'])
  })
})

describe('tax/withdrawal — 경계값', () => {
  const ctx = {
    age: 60,
    etfKind: 'foreignListed' as const,
    rules: RULES,
    remainingForeignDeduction: 2_500_000,
    privatePensionIncomeThisYear: 0,
    pensionYearIndex: 1,
    retirementIncomeTaxRate: 0.05,
  }

  it('차익 비율 0%(전액 원금)면 세금 0', () => {
    const state = makeAccounts({ taxable: 100_000_000 }, { gainRatio: 0 }).taxable
    expect(taxOnWithdrawal('taxable', 10_000_000, state, ctx).tax).toBe(0)
  })

  it('해외상장 ETF: 250만원 기본공제가 적용된다', () => {
    const state = makeAccounts({ taxable: 100_000_000 }, { gainRatio: 1 }).taxable
    const result = taxOnWithdrawal('taxable', 5_000_000, state, ctx)
    expect(result.tax).toBeCloseTo((5_000_000 - 2_500_000) * 0.22, 6)
    expect(result.usedForeignDeduction).toBeCloseTo(2_500_000, 6)
  })

  it('국내상장 해외ETF: 250만원 공제가 적용되지 않는다 (혼동 방지)', () => {
    const domestic = { ...ctx, etfKind: 'domesticListedForeign' as const, remainingForeignDeduction: 0 }
    const state = makeAccounts({ taxable: 100_000_000 }, { gainRatio: 1 }).taxable
    const result = taxOnWithdrawal('taxable', 5_000_000, state, domestic)
    expect(result.tax).toBeCloseTo(5_000_000 * 0.154, 6)
    expect(result.usedForeignDeduction).toBe(0)
  })

  it('국내주식형 ETF: 매매차익 비과세', () => {
    const equity = { ...ctx, etfKind: 'domesticEquity' as const }
    const state = makeAccounts({ taxable: 100_000_000 }, { gainRatio: 1 }).taxable
    expect(taxOnWithdrawal('taxable', 5_000_000, state, equity).tax).toBe(0)
  })

  it('연금소득세율 연령 경계 (69/70, 79/80)', () => {
    expect(pensionWithdrawalRate(69, RULES)).toBeCloseTo(0.055, 6)
    expect(pensionWithdrawalRate(70, RULES)).toBeCloseTo(0.044, 6)
    expect(pensionWithdrawalRate(79, RULES)).toBeCloseTo(0.044, 6)
    expect(pensionWithdrawalRate(80, RULES)).toBeCloseTo(0.033, 6)
  })

  it('사적연금 1,500만원 경계에서 세율이 바뀐다', () => {
    const state = makeAccounts({ pensionSavings: 500_000_000 }, { gainRatio: 0.5, deductedRatio: 0.5 }).pensionSavings
    const under = taxOnWithdrawal('pensionSavings', 14_990_000, state, { ...ctx, pensionYearIndex: 20 })
    const over = taxOnWithdrawal('pensionSavings', 15_010_000, state, { ...ctx, pensionYearIndex: 20 })
    // 과세 대상 비율 100% (세액공제 원금 50% + 수익 50%)
    expect(under.tax / 14_990_000).toBeCloseTo(0.055, 4)
    expect(over.tax / 15_010_000).toBeCloseTo(0.165, 4)
  })

  it('연금수령한도 = 평가액 / (11 − 연차) × 1.2', () => {
    expect(pensionAnnualLimit(100_000_000, 1, RULES)).toBeCloseTo((100_000_000 / 10) * 1.2, 6)
    expect(pensionAnnualLimit(100_000_000, 11, RULES)).toBe(Number.POSITIVE_INFINITY)
  })

  it('연금수령한도 초과분은 기타소득세율이 추가 적용된다', () => {
    const state = makeAccounts({ pensionSavings: 100_000_000 }, { gainRatio: 0, deductedRatio: 1 }).pensionSavings
    const within = taxOnWithdrawal('pensionSavings', 12_000_000, state, ctx)
    const over = taxOnWithdrawal('pensionSavings', 20_000_000, state, ctx)
    expect(over.tax / 20_000_000).toBeGreaterThan(within.tax / 12_000_000)
  })

  it('DC·퇴직금: 연금 수령 10년 이내는 30% 감면', () => {
    const state = makeAccounts({ dcRetirement: 100_000_000 }).dcRetirement
    const within10 = taxOnWithdrawal('dcRetirement', 10_000_000, state, { ...ctx, pensionYearIndex: 5 })
    const after10 = taxOnWithdrawal('dcRetirement', 10_000_000, state, { ...ctx, pensionYearIndex: 11 })
    expect(within10.tax).toBeCloseTo(10_000_000 * 0.05 * 0.7, 6)
    expect(after10.tax).toBeCloseTo(10_000_000 * 0.05 * 0.6, 6)
  })

  it('인출액 0이면 세금 0', () => {
    const state = makeAccounts({ taxable: 100_000_000 }, { gainRatio: 1 }).taxable
    expect(taxOnWithdrawal('taxable', 0, state, ctx).tax).toBe(0)
  })
})

describe('건강보험료 근사', () => {
  it('합산 요율 = 건보료율 × (1 + 장기요양 비중) ≈ 8.13%', () => {
    expect(combinedInsuranceRate(RULES)).toBeCloseTo(0.0719 * 1.1314, 8)
  })

  it('미반영 모드는 0', () => {
    expect(
      annualHealthInsurance({ mode: 'none', publicPensionIncome: 50_000_000, financialIncome: 50_000_000 }, RULES),
    ).toBe(0)
  })

  it('정액 모드는 월액 × 12', () => {
    expect(
      annualHealthInsurance(
        { mode: 'fixed', fixedMonthlyAmount: 200_000, publicPensionIncome: 0, financialIncome: 0 },
        RULES,
      ),
    ).toBe(2_400_000)
  })

  it('공적연금은 50%만 소득으로 인정한다', () => {
    expect(assessableIncome({ mode: 'rateApprox', publicPensionIncome: 20_000_000, financialIncome: 0 }, RULES)).toBeCloseTo(
      10_000_000,
      6,
    )
  })

  it('금융소득은 1,000만원 초과분만 소득에 포함된다', () => {
    expect(assessableIncome({ mode: 'rateApprox', publicPensionIncome: 0, financialIncome: 9_000_000 }, RULES)).toBe(0)
    expect(
      assessableIncome({ mode: 'rateApprox', publicPensionIncome: 0, financialIncome: 15_000_000 }, RULES),
    ).toBeCloseTo(5_000_000, 6)
  })

  it('소득이 없어도 최저보험료가 부과된다', () => {
    const premium = annualHealthInsurance({ mode: 'rateApprox', publicPensionIncome: 0, financialIncome: 0 }, RULES)
    expect(premium).toBe(RULES.healthInsurance.minAnnualPremium.value.amount)
  })
})

describe('연금 모델', () => {
  it('출생연도별 기준 수급 연령', () => {
    expect(normalPensionAge(1960, RULES)).toBe(62)
    expect(normalPensionAge(1970, RULES)).toBe(65)
    expect(normalPensionAge(undefined, RULES)).toBe(65)
  })

  it('공단 예상액을 입력했으면 조기/연기 조정을 다시 적용하지 않는다', () => {
    const plan = { monthlyAmountToday: 1_000_000, startAge: 60, isCompanyEstimate: true, inflationIndexed: true, effectiveTaxRate: 0.03 }
    expect(pensionAdjustmentFactor(plan, 1970, RULES)).toBe(1)
  })

  it('조기수령 5년은 연 6%씩 감액 → 70%', () => {
    const plan = { monthlyAmountToday: 1_000_000, startAge: 60, isCompanyEstimate: false, inflationIndexed: true, effectiveTaxRate: 0.03 }
    expect(pensionAdjustmentFactor(plan, 1970, RULES)).toBeCloseTo(0.7, 8)
  })

  it('연기수령 5년은 연 7.2%씩 증액 → 136%', () => {
    const plan = { monthlyAmountToday: 1_000_000, startAge: 70, isCompanyEstimate: false, inflationIndexed: true, effectiveTaxRate: 0.03 }
    expect(pensionAdjustmentFactor(plan, 1970, RULES)).toBeCloseTo(1.36, 8)
  })

  it('물가연동 ON이면 실질가치가 유지된다', () => {
    const national = { monthlyAmountToday: 1_000_000, startAge: 65, isCompanyEstimate: true, inflationIndexed: true, effectiveTaxRate: 0 }
    const other = { monthlyAmountToday: 0, startAge: 60, inflationIndexed: false }
    const at65 = pensionIncomeAt(65, national, other, 35, 0.02, 1)
    const at85 = pensionIncomeAt(85, national, other, 35, 0.02, 1)
    // 명목은 증가하지만 실질(오늘 기준)은 동일
    expect(at85.nationalAnnual).toBeGreaterThan(at65.nationalAnnual)
    expect(at85.nationalAnnual / Math.pow(1.02, 50)).toBeCloseTo(12_000_000, 4)
    expect(at65.nationalAnnual / Math.pow(1.02, 30)).toBeCloseTo(12_000_000, 4)
  })

  it('물가연동 OFF면 개시 시점 명목액에 고정된다', () => {
    const national = { monthlyAmountToday: 1_000_000, startAge: 65, isCompanyEstimate: true, inflationIndexed: false, effectiveTaxRate: 0 }
    const other = { monthlyAmountToday: 0, startAge: 60, inflationIndexed: false }
    const at65 = pensionIncomeAt(65, national, other, 35, 0.02, 1)
    const at85 = pensionIncomeAt(85, national, other, 35, 0.02, 1)
    expect(at85.nationalAnnual).toBeCloseTo(at65.nationalAnnual, 4)
  })

  it('개시 연령 전에는 0', () => {
    const national = { monthlyAmountToday: 1_000_000, startAge: 65, isCompanyEstimate: true, inflationIndexed: true, effectiveTaxRate: 0 }
    const other = { monthlyAmountToday: 0, startAge: 60, inflationIndexed: false }
    expect(pensionIncomeAt(60, national, other, 35, 0.02, 1).grossAnnual).toBe(0)
  })
})

describe('withdraw — 경계값', () => {
  it('자산 0으로 은퇴해도 예외 없이 결과를 반환한다', () => {
    const input = makeInput({ basic: { currentAge: 54, retirementAge: 55, endAge: 60 } })
    const result = withdraw(makeAccounts({}), input, RULES)
    expect(result.rows.length).toBe(6)
    expect(result.firstYearMonthlyNet.nominal).toBe(0)
  })

  it('은퇴 나이 = 종료 나이면 1개 행', () => {
    const input = makeInput({ basic: { currentAge: 54, retirementAge: 55, endAge: 55 } })
    const result = withdraw(makeAccounts({ taxable: 100_000_000 }), input, RULES)
    expect(result.rows.length).toBe(1)
  })

  it('VPW는 매년 잔여자산·잔여기간으로 재산정한다', () => {
    const input = makeInput({
      basic: { currentAge: 54, retirementAge: 55, endAge: 85 },
      returns: { inflation: 0, retirementReturn: 0.02 },
      retirement: { strategy: 'vpw', healthInsurance: { mode: 'none' }, nationalPension: { monthlyAmountToday: 0 } },
    })
    const result = withdraw(makeAccounts({ taxable: 1_000_000_000 }), input, FREE)
    // VPW는 종료 나이에 잔액 0이 되도록 설계되므로 조기 고갈만 없어야 한다
    expect(result.depletionAge === null || result.depletionAge === 85).toBe(true)
    const last = result.rows[result.rows.length - 1]
    expect(last?.endingBalance.nominal ?? 0).toBeLessThan(1_000_000)
  })

  it('VPW는 종료 나이 전에 고갈되지 않는다', () => {
    const input = makeInput({
      basic: { currentAge: 54, retirementAge: 55, endAge: 85 },
      returns: { inflation: 0.02, retirementReturn: 0.04 },
      retirement: { strategy: 'vpw', healthInsurance: { mode: 'none' }, nationalPension: { monthlyAmountToday: 0 } },
    })
    const result = withdraw(makeAccounts({ taxable: 1_000_000_000 }), input, RULES)
    const premature = result.rows.filter((r) => r.age < 85 && r.endingBalance.nominal <= 1)
    expect(premature).toHaveLength(0)
  })

  it('연금소득만으로 생활비가 충족되면 인출액이 전략에 따라 결정된다', () => {
    const input = makeInput({
      basic: { currentAge: 54, retirementAge: 55, endAge: 95 },
      retirement: {
        strategy: 'fixedPercent',
        targetMonthlySpendToday: 1_000_000,
        nationalPension: { monthlyAmountToday: 3_000_000, startAge: 55 },
      },
    })
    const result = withdraw(makeAccounts({ taxable: 100_000_000 }), input, RULES)
    expect(result.rows[0]?.pensionIncome).toBeGreaterThan(0)
    expect(result.firstYearMonthlyNet.nominal).toBeGreaterThan(3_000_000)
  })

  it('ISA는 은퇴 시점에 정산되어 일반계좌로 이관된다', () => {
    const input = makeInput({ basic: { currentAge: 45, retirementAge: 60, endAge: 95 } })
    const accounts = makeAccounts({ isa: 200_000_000 }, { gainRatio: 0.5 })
    const result = withdraw(accounts, input, RULES)
    expect(result.isaSettlementTax).toBeGreaterThan(0)
    // 정산 후에는 ISA 잔액이 없으므로 인출은 일반계좌에서 발생한다
    expect(result.rows[0]?.withdrawalByAccount.isa).toBe(0)
    expect(result.rows[0]?.withdrawalByAccount.taxable).toBeGreaterThan(0)
  })
})

describe('solve — 예외 경로', () => {
  it('이미 목표를 초과 달성하면 필요 납입액 0', () => {
    const input = makeInput({
      basic: { currentAge: 40, retirementAge: 60 },
      accounts: { initialBalances: { taxable: 5_000_000_000 } },
      retirement: { targetMonthlySpendToday: 1_000_000 },
    })
    const result = solveMonthlyContribution(input, RULES)
    expect(result.value).toBe(0)
  })

  it('달성 불가능한 목표는 null 을 반환한다', () => {
    const input = makeInput({
      basic: { currentAge: 60, retirementAge: 61, endAge: 100 },
      retirement: { targetMonthlySpendToday: 400_000_000 },
    })
    expect(solveMonthlyContribution(input, RULES).value).toBeNull()
    expect(solveRequiredReturn(input, RULES).value).toBeNull()
    expect(solveEarliestRetirementAge(input, RULES).value).toBeNull()
  })

  it('필요 수익률 솔버 결과를 대입하면 목표를 달성한다', () => {
    const input = makeInput({
      basic: { currentAge: 35, retirementAge: 60 },
      accounts: { monthlyContribution: 1_000_000 },
      retirement: { targetMonthlySpendToday: 3_000_000 },
    })
    const solved = solveRequiredReturn(input, RULES)
    expect(solved.value).not.toBeNull()
    const applied = runFullSimulation(
      { ...input, returns: { ...input.returns, mode: 'totalReturn', totalReturn: solved.value as number } },
      RULES,
    )
    expect(applied.fire.achievementBySpend).toBeCloseTo(1, 2)
  })

  it('가장 이른 은퇴 나이 솔버가 정수를 반환한다', () => {
    const input = makeInput({
      basic: { currentAge: 30, retirementAge: 55, endAge: 95 },
      accounts: { monthlyContribution: 3_000_000 },
      retirement: { targetMonthlySpendToday: 2_000_000 },
    })
    const solved = solveEarliestRetirementAge(input, RULES)
    expect(solved.value).not.toBeNull()
    expect(Number.isInteger(solved.value)).toBe(true)
  })
})

describe('bisect', () => {
  it('부호가 바뀌지 않으면 null', () => {
    expect(bisect((x) => x + 10, { lo: 0, hi: 5, tol: 1e-6 })).toBeNull()
  })

  it('근을 찾는다', () => {
    const root = bisect((x) => x * x - 4, { lo: 0, hi: 10, tol: 1e-9 })
    expect(root).toBeCloseTo(2, 6)
  })

  it('상한을 확장하며 근을 찾는다', () => {
    const root = bisectExpanding((x) => x - 1000, { lo: 0, hi: 1, tol: 1e-6 })
    expect(root).toBeCloseTo(1000, 3)
  })

  it('lo 에서 이미 조건을 만족하면 lo 를 반환한다', () => {
    expect(bisectExpanding((x) => x, { lo: 0, hi: 1, tol: 1e-6 })).toBe(0)
  })

  it('NaN 을 만나면 null', () => {
    expect(bisect(() => NaN, { lo: 0, hi: 1, tol: 1e-6 })).toBeNull()
  })
})

describe('scenario', () => {
  it('보수적 시나리오는 수익률을 낮추고 물가를 올린다', () => {
    const input = makeInput()
    const conservative = applyScenario(input, 'conservative')
    expect(conservative.returns.priceReturn).toBeCloseTo(0.055 - 0.02, 8)
    expect(conservative.returns.inflation).toBeCloseTo(0.025, 8)
  })

  it('기준 시나리오는 입력값을 유지한다', () => {
    const input = makeInput()
    const base = applyScenario(input, 'base')
    expect(base.returns.priceReturn).toBeCloseTo(0.055, 8)
    expect(base.returns.inflation).toBeCloseTo(0.02, 8)
  })

  it('세 시나리오의 최종자산이 순서대로 정렬된다', () => {
    const results = runScenarios(makeInput(), RULES)
    const [conservative, base, optimistic] = results
    expect(conservative?.result.accumulation.finalBalance.nominal).toBeLessThan(
      base?.result.accumulation.finalBalance.nominal ?? 0,
    )
    expect(base?.result.accumulation.finalBalance.nominal).toBeLessThan(
      optimistic?.result.accumulation.finalBalance.nominal ?? 0,
    )
  })

  it('배당수익률은 시나리오 오프셋의 영향을 받지 않는다', () => {
    const results = runScenarios(makeInput(), RULES)
    for (const scenario of results) {
      expect(scenario.result.normalizedReturns.dividendYield).toBeCloseTo(0.015, 8)
    }
  })
})

describe('runFullSimulation — 통합', () => {
  it('가정과 경고가 항상 포함된다 (CLAUDE.md R-8)', () => {
    const result = runFullSimulation(makeInput(), RULES)
    expect(result.assumptions.length).toBeGreaterThan(20)
    expect(result.assumptions.some((a) => a.group === '한계')).toBe(true)
    expect(result.assumptions.some((a) => a.source !== undefined)).toBe(true)
    expect(Array.isArray(result.warnings)).toBe(true)
  })

  it('기본값 결과가 상식적인 범위다 (M-1 자동화)', () => {
    const result = runFullSimulation(makeInput(), RULES)
    // 35세, 월 100만원, 20년, 7% → 은퇴자산 5~8억원 수준
    expect(result.accumulation.finalBalance.nominal).toBeGreaterThan(400_000_000)
    expect(result.accumulation.finalBalance.nominal).toBeLessThan(900_000_000)
    expect(result.fire.achievementBySpend).toBeGreaterThan(0)
    expect(result.fire.comparison.length).toBeGreaterThanOrEqual(4)
  })

  it('수익률 0이면 최종자산 = 납입원금 (M-3 자동화)', () => {
    const input = makeInput({
      returns: { mode: 'totalReturn', totalReturn: 0, dividendYield: 0, ter: 0 },
      accounts: { reinvestTaxCredit: false },
    })
    const result = runFullSimulation(input, FREE)
    expect(result.accumulation.finalBalance.nominal).toBeCloseTo(result.accumulation.totalPrincipal, 2)
  })

  it('물가 0이면 명목 = 실질 (M-2 자동화)', () => {
    const result = runFullSimulation(makeInput({ returns: { inflation: 0 } }), RULES)
    expect(result.accumulation.finalBalance.real).toBeCloseTo(result.accumulation.finalBalance.nominal, 4)
    expect(result.withdrawal.firstYearMonthlyNet.real).toBeCloseTo(result.withdrawal.firstYearMonthlyNet.nominal, 4)
  })

  it('인출률 비교표에 3% / 3.5% / 4% / 소진형이 모두 있다', () => {
    const result = runFullSimulation(makeInput(), RULES)
    const methods = result.fire.comparison.map((r) => r.method)
    expect(methods).toContain('연 3.0% 인출')
    expect(methods).toContain('연 3.5% 인출')
    expect(methods).toContain('연 4.0% 인출')
    expect(methods.some((m) => m.startsWith('계획 소진형'))).toBe(true)
  })

  it('사용자 지정 인출률이 비교표에 추가된다', () => {
    const result = runFullSimulation(makeInput({ retirement: { withdrawalRate: 0.032 } }), RULES)
    expect(result.fire.comparison.some((r) => r.method.includes('지정'))).toBe(true)
  })

  it('인출률이 낮으면 필요자산이 크다', () => {
    const result = runFullSimulation(makeInput(), RULES)
    const rows = result.fire.comparison.filter((r) => r.rate !== null)
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1]
      const cur = rows[i]
      if (!prev || !cur) continue
      expect(cur.requiredAssets.nominal).toBeLessThanOrEqual(prev.requiredAssets.nominal + 1)
    }
  })

  it('브리지 기간 경고가 발생한다', () => {
    const result = runFullSimulation(makeInput({ basic: { currentAge: 35, retirementAge: 50 } }), RULES)
    expect(result.warnings.some((w) => w.code === 'BRIDGE_PERIOD')).toBe(true)
  })

  it('개정안 적용 시 경고가 발생한다', () => {
    const result = runFullSimulation(makeInput({ options: { applyProposedRules: true } }), RULES)
    expect(result.warnings.some((w) => w.code === 'PROPOSED_RULES_APPLIED')).toBe(true)
  })
})
