/**
 * 골든 테스트 G-10, G-11, G-12 (design/07-test-plan.md §2)
 * 계좌·세제 모델의 핵심 통찰이 계산에 실제로 반영되는지 검증한다.
 */

import { describe, expect, it } from 'vitest'
import { accumulate } from '@/calc/accumulate'
import { allocateYear, createLimitState, taxCreditForYear } from '@/calc/allocate'
import { normalizeReturns } from '@/calc/rates'
import { settleIsa } from '@/calc/tax/withdrawal'
import { RULES, makeInput, taxFreeRules } from '../helpers'

describe('G-10. 배당 원천징수의 30년 누적 효과', () => {
  const base = makeInput({
    basic: { currentAge: 35, retirementAge: 65 },
    returns: {
      mode: 'totalReturn',
      totalReturn: 0.07,
      dividendYield: 0.015,
      inflation: 0,
      ter: 0,
      reinvestDividends: true,
    },
    accounts: { monthlyContribution: 0, contributionGrowthRate: 0, reinvestTaxCredit: false },
  })

  const taxDeferred = accumulate(
    { ...base, accounts: { ...base.accounts, initialBalances: { ...base.accounts.initialBalances, pensionSavings: 100_000_000 } } },
    normalizeReturns(base.returns),
    RULES,
  )
  const taxable = accumulate(
    { ...base, accounts: { ...base.accounts, initialBalances: { ...base.accounts.initialBalances, taxable: 100_000_000 } } },
    normalizeReturns(base.returns),
    RULES,
  )

  it('과세이연 계좌가 일반계좌보다 자산이 많다', () => {
    expect(taxDeferred.finalBalance.nominal).toBeGreaterThan(taxable.finalBalance.nominal)
  })

  it('차이가 5% 이상이다 — ISA·연금계좌의 진짜 가치는 축적기 배당 비과세다', () => {
    const gap = 1 - taxable.finalBalance.nominal / taxDeferred.finalBalance.nominal
    expect(gap).toBeGreaterThan(0.05)
  })

  it('일반계좌만 배당 원천징수가 발생한다', () => {
    expect(taxDeferred.totalTaxPaid).toBe(0)
    expect(taxable.totalTaxPaid).toBeGreaterThan(0)
  })

  it('배당수익률이 0이면 두 계좌의 결과가 같다', () => {
    const noDiv = { ...base, returns: { ...base.returns, dividendYield: 0 } }
    const a = accumulate(
      { ...noDiv, accounts: { ...noDiv.accounts, initialBalances: { ...noDiv.accounts.initialBalances, pensionSavings: 100_000_000 } } },
      normalizeReturns(noDiv.returns),
      RULES,
    )
    const b = accumulate(
      { ...noDiv, accounts: { ...noDiv.accounts, initialBalances: { ...noDiv.accounts.initialBalances, taxable: 100_000_000 } } },
      normalizeReturns(noDiv.returns),
      RULES,
    )
    expect(a.finalBalance.nominal).toBeCloseTo(b.finalBalance.nominal, 6)
  })
})

describe('G-11. 계좌 오버플로 배분', () => {
  const plan = makeInput({ accounts: { monthlyContribution: 4_000_000 } }).accounts

  it('연 4,800만원이 우선순위와 한도에 따라 배분된다', () => {
    const limits = createLimitState()
    const { allocation } = allocateYear(48_000_000, plan, RULES, limits)

    // 1차 패스: 연금저축 세액공제 한도 600만 + IRP 추가 300만 = 900만
    expect(allocation.pensionSavings).toBeCloseTo(6_000_000, 6)
    expect(allocation.irp).toBeCloseTo(3_000_000, 6)
    // 그다음 ISA (연 한도 4,000만원 내에서 잔여 전액)
    expect(allocation.isa).toBeCloseTo(39_000_000, 6)
    expect(allocation.taxable).toBeCloseTo(0, 6)
  })

  it('배분 합계가 납입액과 정확히 일치한다', () => {
    const limits = createLimitState()
    const { allocation } = allocateYear(48_000_000, plan, RULES, limits)
    const sum = Object.values(allocation).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(48_000_000, 6)
  })

  it('연금저축+IRP는 합산 한도(1,800만원)를 넘지 않는다', () => {
    // ISA를 우선순위에서 제외하면 2차 패스(연금 추가 납입)가 동작한다
    const noIsa = { ...plan, allocationPriority: ['pensionSavings', 'irp'] as typeof plan.allocationPriority }
    const limits = createLimitState()
    const { allocation } = allocateYear(48_000_000, noIsa, RULES, limits)

    expect(allocation.pensionSavings + allocation.irp).toBeCloseTo(18_000_000, 6)
    expect(allocation.isa).toBeCloseTo(0, 6)
    expect(allocation.taxable).toBeCloseTo(30_000_000, 6)
  })

  it('개별 한도로 잘못 처리하면 깨진다 — 합산 한도가 강제된다', () => {
    const onlyPension = {
      ...plan,
      allocationPriority: ['pensionSavings'] as typeof plan.allocationPriority,
    }
    const limits = createLimitState()
    const { allocation } = allocateYear(36_000_000, onlyPension, RULES, limits)
    expect(allocation.pensionSavings).toBeCloseTo(18_000_000, 6)
    expect(allocation.taxable).toBeCloseTo(18_000_000, 6)
  })

  it('ISA 누적 한도(2억원)를 넘지 않는다', () => {
    const isaOnly = { ...plan, allocationPriority: ['isa'] as typeof plan.allocationPriority }
    const limits = createLimitState(195_000_000) // 이미 1.95억 납입
    const { allocation } = allocateYear(40_000_000, isaOnly, RULES, limits)
    expect(allocation.isa).toBeCloseTo(5_000_000, 6)
    expect(allocation.taxable).toBeCloseTo(35_000_000, 6)
  })
})

describe('G-12. 세액공제 환급금', () => {
  const deducted = {
    taxable: 0,
    isa: 0,
    pensionSavings: 6_000_000,
    irp: 3_000_000,
    dcRetirement: 0,
  }

  it('총급여 5,500만원 초과 → 900만원 × 13.2% = 1,188,000원', () => {
    expect(taxCreditForYear(deducted, 'over55m', RULES)).toBeCloseTo(1_188_000, 6)
  })

  it('총급여 5,500만원 이하 → 900만원 × 16.5% = 1,485,000원', () => {
    expect(taxCreditForYear(deducted, 'under55m', RULES)).toBeCloseTo(1_485_000, 6)
  })

  it('연금저축만 900만원 납입해도 공제 대상은 600만원까지', () => {
    const savingsOnly = { ...deducted, pensionSavings: 9_000_000, irp: 0 }
    expect(taxCreditForYear(savingsOnly, 'over55m', RULES)).toBeCloseTo(6_000_000 * 0.132, 6)
  })

  it('환급금 재투자를 켜면 최종 자산이 늘어난다', () => {
    const base = makeInput({
      basic: { currentAge: 35, retirementAge: 55, salaryBracket: 'under55m' },
      returns: { inflation: 0, dividendYield: 0, ter: 0 },
      accounts: { monthlyContribution: 750_000, contributionGrowthRate: 0 },
    })
    const withCredit = accumulate(
      { ...base, accounts: { ...base.accounts, reinvestTaxCredit: true } },
      normalizeReturns(base.returns),
      RULES,
    )
    const withoutCredit = accumulate(
      { ...base, accounts: { ...base.accounts, reinvestTaxCredit: false } },
      normalizeReturns(base.returns),
      RULES,
    )
    expect(withCredit.finalBalance.nominal).toBeGreaterThan(withoutCredit.finalBalance.nominal)
    expect(withCredit.totalTaxCredit).toBeGreaterThan(0)
  })
})

describe('ISA 만기 정산', () => {
  const state = {
    balance: 150_000_000,
    costBasis: 100_000_000,
    deductedPrincipal: 0,
    nonDeductedPrincipal: 100_000_000,
    totalContributed: 100_000_000,
    taxPaidCumulative: 0,
  }

  it('일반형: 순이익 5,000만원 − 비과세 200만원 → 4,800만원 × 9.9%', () => {
    const result = settleIsa(state, 'general', 10, RULES)
    expect(result.netProfit).toBeCloseTo(50_000_000, 6)
    expect(result.exemptLimit).toBe(2_000_000)
    expect(result.tax).toBeCloseTo(48_000_000 * 0.099, 6)
  })

  it('서민형: 비과세 한도가 400만원으로 두 배', () => {
    const result = settleIsa(state, 'lowIncome', 10, RULES)
    expect(result.exemptLimit).toBe(4_000_000)
    expect(result.tax).toBeCloseTo(46_000_000 * 0.099, 6)
  })

  it('의무가입기간(3년) 미충족 시 혜택을 상실한다', () => {
    const result = settleIsa(state, 'general', 2, RULES)
    expect(result.holdingRequirementMet).toBe(false)
    expect(result.exemptLimit).toBe(0)
    // 비과세 한도 없이 배당소득세율 적용
    expect(result.tax).toBeCloseTo(50_000_000 * 0.154, 6)
  })

  it('손실이면 세금이 없다', () => {
    const loss = { ...state, balance: 80_000_000 }
    expect(settleIsa(loss, 'general', 10, RULES).tax).toBe(0)
  })
})

describe('세금 0 룰셋에서는 계좌 유형별 결과가 같다 (M-4 자동화)', () => {
  const FREE = taxFreeRules()
  const base = makeInput({
    basic: { currentAge: 35, retirementAge: 65 },
    returns: { inflation: 0, dividendYield: 0.02, ter: 0 },
    accounts: { monthlyContribution: 0, contributionGrowthRate: 0, reinvestTaxCredit: false },
  })

  it('일반계좌 = 연금저축 = ISA', () => {
    const run = (account: 'taxable' | 'pensionSavings' | 'isa') =>
      accumulate(
        {
          ...base,
          accounts: {
            ...base.accounts,
            initialBalances: { ...base.accounts.initialBalances, [account]: 100_000_000 },
          },
        },
        normalizeReturns(base.returns),
        FREE,
      ).finalBalance.nominal

    expect(run('taxable')).toBeCloseTo(run('pensionSavings'), 4)
    expect(run('taxable')).toBeCloseTo(run('isa'), 4)
  })
})
