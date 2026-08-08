/**
 * 세제 데이터 레이어 타입 (design/03-tax-and-accounts.md §7.1)
 *
 * ADR-3: 모든 제도 수치는 이 구조로만 존재하며, 계산 엔진은 인자로 받는다.
 * 모든 항목에 source / asOf / status 를 필수로 붙인다 (CLAUDE.md R-3).
 */

export type RuleStatus =
  | 'confirmed' // 시행 중인 법령
  | 'proposed' // 국회 통과 전 개정안 — 기본 계산에서 제외
  | 'needs-verification' // 자료 간 상충 또는 미확인
  | 'approximation' // 의도적 단순화

export interface Sourced<T> {
  readonly value: T
  readonly source: string
  readonly asOf: string // 'YYYY-MM-DD'
  readonly status: RuleStatus
  readonly note?: string
}

export interface TaxRuleSet {
  readonly id: string
  readonly label: string
  readonly effectiveFrom: string
  readonly lastReviewed: string

  readonly dividendWithholding: Sourced<{ rate: number }>
  readonly comprehensiveIncomeThreshold: Sourced<{ amount: number }>

  readonly etf: {
    readonly domesticEquity: Sourced<{ capitalGainsRate: number; annualDeduction: number }>
    readonly domesticListedForeign: Sourced<{ capitalGainsRate: number; annualDeduction: number }>
    readonly foreignListed: Sourced<{ capitalGainsRate: number; annualDeduction: number }>
  }

  readonly isa: {
    readonly annualLimit: Sourced<{ amount: number }>
    readonly lifetimeLimit: Sourced<{ amount: number }>
    readonly exemptGeneral: Sourced<{ amount: number }>
    readonly exemptLowIncome: Sourced<{ amount: number }>
    readonly excessRate: Sourced<{ rate: number }>
    readonly minHoldingYears: Sourced<{ years: number }>
    readonly carryOverUnused: Sourced<{ enabled: boolean }>
  }

  readonly pensionAccount: {
    readonly combinedAnnualLimit: Sourced<{ amount: number }>
    readonly creditLimitSavings: Sourced<{ amount: number }>
    readonly creditLimitCombined: Sourced<{ amount: number }>
    readonly creditRateLow: Sourced<{ rate: number }>
    readonly creditRateHigh: Sourced<{ rate: number }>
    readonly creditIncomeThreshold: Sourced<{ amount: number }>
    readonly withdrawalRates: Sourced<{ under70: number; under80: number; over80: number }>
    readonly separateTaxThreshold: Sourced<{ amount: number }>
    readonly separateTaxRate: Sourced<{ rate: number }>
    readonly earlyWithdrawalRate: Sourced<{ rate: number }>
    readonly annualLimitFactor: Sourced<{ divisorBase: number; multiplier: number }>
    readonly minAge: Sourced<{ age: number }>
    readonly retirementPensionDiscountWithin10: Sourced<{ ratio: number }>
    readonly retirementPensionDiscountAfter10: Sourced<{ ratio: number }>
  }

  readonly nationalPension: {
    readonly contributionRate: Sourced<{ rate: number }>
    readonly incomeReplacementRate: Sourced<{ rate: number }>
    readonly aValue: Sourced<{ amount: number }>
    readonly incomeCeiling: Sourced<{ amount: number }>
    readonly incomeFloor: Sourced<{ amount: number }>
    readonly earlyReductionPerYear: Sourced<{ rate: number }>
    readonly deferralBonusPerYear: Sourced<{ rate: number }>
    /** [출생연도 하한, 기준 수급 연령] — 오름차순 */
    readonly normalAgeByBirthYear: Sourced<{ table: readonly (readonly [number, number])[] }>
    readonly inflationIndexed: Sourced<{ enabled: boolean }>
    readonly effectiveTaxRate: Sourced<{ rate: number }>
  }

  readonly healthInsurance: {
    readonly rate: Sourced<{ rate: number }>
    readonly longTermCareRatio: Sourced<{ ratio: number }>
    readonly pensionIncomeRecognitionRatio: Sourced<{ ratio: number }>
    readonly financialIncomeThreshold: Sourced<{ amount: number }>
    readonly minAnnualPremium: Sourced<{ amount: number }>
  }

  readonly inflation: {
    readonly bokTarget: Sourced<{ rate: number }>
  }

  /** status: 'proposed' 항목만 모아둔다 — 사용자 토글로만 활성화 */
  readonly proposed: {
    readonly isaExemptGeneral: Sourced<{ amount: number }>
    readonly isaExemptLowIncome: Sourced<{ amount: number }>
  }
}
