/**
 * 테스트 공통 헬퍼.
 *
 * 골든 테스트는 반드시 룰셋 ID를 명시적으로 지정한다 — 기본값이 바뀌어도 테스트가 깨지지 않게.
 */

import { getRuleSet } from '@/data/tax'
import type { TaxRuleSet } from '@/data/tax/types'
import { DEFAULT_INPUT } from '@/lib/defaults'
import type { AccountState, AccountType, CalculatorInput } from '@/calc/types'

export const RULES: TaxRuleSet = getRuleSet('kr-2026')

/** 세금을 전부 0으로 만든 룰셋 — 순수 복리 검증용 */
export function taxFreeRules(base: TaxRuleSet = RULES): TaxRuleSet {
  return {
    ...base,
    dividendWithholding: { ...base.dividendWithholding, value: { rate: 0 } },
    etf: {
      domesticEquity: { ...base.etf.domesticEquity, value: { capitalGainsRate: 0, annualDeduction: 0 } },
      domesticListedForeign: {
        ...base.etf.domesticListedForeign,
        value: { capitalGainsRate: 0, annualDeduction: 0 },
      },
      foreignListed: { ...base.etf.foreignListed, value: { capitalGainsRate: 0, annualDeduction: 0 } },
    },
    isa: {
      ...base.isa,
      excessRate: { ...base.isa.excessRate, value: { rate: 0 } },
    },
    pensionAccount: {
      ...base.pensionAccount,
      withdrawalRates: {
        ...base.pensionAccount.withdrawalRates,
        value: { under70: 0, under80: 0, over80: 0 },
      },
      separateTaxRate: { ...base.pensionAccount.separateTaxRate, value: { rate: 0 } },
      earlyWithdrawalRate: { ...base.pensionAccount.earlyWithdrawalRate, value: { rate: 0 } },
      creditRateLow: { ...base.pensionAccount.creditRateLow, value: { rate: 0 } },
      creditRateHigh: { ...base.pensionAccount.creditRateHigh, value: { rate: 0 } },
      retirementPensionDiscountWithin10: {
        ...base.pensionAccount.retirementPensionDiscountWithin10,
        value: { ratio: 0 },
      },
      retirementPensionDiscountAfter10: {
        ...base.pensionAccount.retirementPensionDiscountAfter10,
        value: { ratio: 0 },
      },
    },
    healthInsurance: {
      ...base.healthInsurance,
      rate: { ...base.healthInsurance.rate, value: { rate: 0 } },
      minAnnualPremium: { ...base.healthInsurance.minAnnualPremium, value: { amount: 0 } },
    },
    nationalPension: {
      ...base.nationalPension,
      effectiveTaxRate: { ...base.nationalPension.effectiveTaxRate, value: { rate: 0 } },
    },
  }
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]
}

function merge<T>(base: T, patch: DeepPartial<T> | undefined): T {
  if (!patch) return base
  const out = { ...(base as Record<string, unknown>) }
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    const current = out[key]
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      current !== null &&
      typeof current === 'object' &&
      !Array.isArray(current)
    ) {
      out[key] = merge(current, value as DeepPartial<unknown>)
    } else {
      out[key] = value
    }
  }
  return out as T
}

/** 기본 입력에 부분 패치를 적용한다 */
export function makeInput(patch?: DeepPartial<CalculatorInput>): CalculatorInput {
  return merge(DEFAULT_INPUT, patch)
}

/**
 * 순수 복리 검증용 입력.
 * 배당 0, TER 0, 증액 0, 세액공제 환급 재투자 없음, 물가 0 → 엑셀 FV 와 직접 대조 가능.
 */
export function pureCompoundInput(patch?: DeepPartial<CalculatorInput>): CalculatorInput {
  return makeInput(
    merge(
      {
        basic: { currentAge: 35, retirementAge: 45, endAge: 95 },
        returns: {
          mode: 'totalReturn' as const,
          totalReturn: 0.07,
          dividendYield: 0,
          inflation: 0,
          ter: 0,
          reinvestDividends: true,
          contributionTiming: 'begin' as const,
        },
        accounts: {
          monthlyContribution: 1_000_000,
          contributionGrowthRate: 0,
          reinvestTaxCredit: false,
        },
      } as DeepPartial<CalculatorInput>,
      patch,
    ),
  )
}

/**
 * 인출기 테스트용 계좌 상태를 직접 만든다.
 * `gainRatio` 는 평가이익 비율 (0이면 전액 원금 → 매매차익 과세 없음).
 */
export function makeAccounts(
  balances: Partial<Record<AccountType, number>>,
  opts: { gainRatio?: number; deductedRatio?: number } = {},
): Record<AccountType, AccountState> {
  const gainRatio = opts.gainRatio ?? 0
  const deductedRatio = opts.deductedRatio ?? 0
  const types: AccountType[] = ['taxable', 'isa', 'pensionSavings', 'irp', 'dcRetirement']
  const out = {} as Record<AccountType, AccountState>
  for (const a of types) {
    const balance = balances[a] ?? 0
    out[a] = {
      balance,
      costBasis: balance * (1 - gainRatio),
      deductedPrincipal: balance * deductedRatio,
      nonDeductedPrincipal: balance * (1 - gainRatio - deductedRatio),
      totalContributed: balance * (1 - gainRatio),
      taxPaidCumulative: 0,
    }
  }
  return out
}

export const zeroBalances: Record<AccountType, number> = {
  taxable: 0,
  isa: 0,
  pensionSavings: 0,
  irp: 0,
  dcRetirement: 0,
}
