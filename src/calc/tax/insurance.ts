/**
 * 은퇴 후 건강보험료 근사 (design/03-tax-and-accounts.md §6, 검토판 §2.3)
 *
 * 한국에서 은퇴 후 실수령액을 좌우하는 가장 큰 변수 중 하나다.
 * 직장가입자 자격을 잃으면 지역가입자로 전환되어 소득 + 재산에 부과된다.
 *
 * ⚠ 재산 부과분은 모델링하지 않으므로 실제보다 과소 추정이다. UI에 반드시 고지한다.
 */

import type { TaxRuleSet } from '@/data/tax/types'
import type { HealthInsuranceMode } from '../types'

export interface InsuranceInput {
  mode: HealthInsuranceMode
  fixedMonthlyAmount?: number
  /** 공적연금 연 수령액 (국민연금 등) */
  publicPensionIncome: number
  /** 금융소득 연액 (일반계좌 배당 + 실현 매매차익) */
  financialIncome: number
}

/** 건강보험료 + 장기요양보험료 합산 실효 요율 (소득 대비) */
export function combinedInsuranceRate(rules: TaxRuleSet): number {
  const h = rules.healthInsurance
  return h.rate.value.rate * (1 + h.longTermCareRatio.value.ratio)
}

/**
 * 지역가입자 소득 인정액 근사.
 * 사적연금(연금저축·IRP) 인출액은 현행 부과 대상이 아니므로 제외한다.
 */
export function assessableIncome(input: InsuranceInput, rules: TaxRuleSet): number {
  const h = rules.healthInsurance
  const pensionPart = input.publicPensionIncome * h.pensionIncomeRecognitionRatio.value.ratio
  const financialPart = Math.max(0, input.financialIncome - h.financialIncomeThreshold.value.amount)
  return Math.max(0, pensionPart + financialPart)
}

/** 연간 건강보험료(장기요양 포함) 추정액 */
export function annualHealthInsurance(input: InsuranceInput, rules: TaxRuleSet): number {
  switch (input.mode) {
    case 'none':
      return 0
    case 'fixed':
      return Math.max(0, (input.fixedMonthlyAmount ?? 0) * 12)
    case 'rateApprox': {
      const income = assessableIncome(input, rules)
      const premium = income * combinedInsuranceRate(rules)
      return Math.max(rules.healthInsurance.minAnnualPremium.value.amount, premium)
    }
  }
}
