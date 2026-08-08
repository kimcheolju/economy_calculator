/**
 * 공적·사적 연금소득 모델 (design/02-calculation-engine.md §5, 검토판 §2.11)
 *
 * 국민연금은 물가에 연동되어 실질가치가 유지되지만 사적연금은 그렇지 않다.
 * 이 차이를 반영하지 않으면 장기 결과가 왜곡된다.
 */

import type { TaxRuleSet } from '@/data/tax/types'
import { toNominal } from './rates'
import type { NationalPensionPlan, OtherPensionPlan } from './types'

/** 출생연도별 기준 수급 개시 연령 */
export function normalPensionAge(birthYear: number | undefined, rules: TaxRuleSet): number {
  const table = rules.nationalPension.normalAgeByBirthYear.value.table
  if (birthYear === undefined) {
    const last = table[table.length - 1]
    return last ? last[1] : 65
  }
  let age = table[0]?.[1] ?? 65
  for (const [fromYear, normalAge] of table) {
    if (birthYear >= fromYear) age = normalAge
  }
  return age
}

/**
 * 조기·연기 수령 조정 계수.
 * 조기: 연 6% 감액 (최대 5년) / 연기: 연 7.2% 증액 (최대 5년)
 *
 * 사용자가 공단 예상액을 그대로 입력했다면(`isCompanyEstimate`) 이중 적용을 막기 위해 1을 반환한다.
 */
export function pensionAdjustmentFactor(
  plan: NationalPensionPlan,
  birthYear: number | undefined,
  rules: TaxRuleSet,
): number {
  if (plan.isCompanyEstimate) return 1
  const normal = normalPensionAge(birthYear, rules)
  const np = rules.nationalPension
  if (plan.startAge < normal) {
    const years = Math.min(5, normal - plan.startAge)
    return Math.max(0, 1 - np.earlyReductionPerYear.value.rate * years)
  }
  if (plan.startAge > normal) {
    const years = Math.min(5, plan.startAge - normal)
    return 1 + np.deferralBonusPerYear.value.rate * years
  }
  return 1
}

/** 해당 나이의 국민연금 명목 월 수령액 */
export function nationalPensionAt(
  age: number,
  plan: NationalPensionPlan,
  currentAge: number,
  inflation: number,
  adjustment: number,
): number {
  if (age < plan.startAge || plan.monthlyAmountToday <= 0) return 0
  const base = plan.monthlyAmountToday * adjustment
  // 물가연동 ON: 실질가치가 항상 유지된다 (제도 실제)
  // 물가연동 OFF: 개시 시점 명목액에 고정 → 이후 실질가치 하락
  const years = plan.inflationIndexed ? age - currentAge : plan.startAge - currentAge
  return toNominal(base, inflation, years)
}

/** 해당 나이의 기타(사적) 연금 명목 월 수령액 */
export function otherPensionAt(
  age: number,
  plan: OtherPensionPlan,
  currentAge: number,
  inflation: number,
): number {
  if (age < plan.startAge || plan.monthlyAmountToday <= 0) return 0
  const years = plan.inflationIndexed ? age - currentAge : plan.startAge - currentAge
  return toNominal(plan.monthlyAmountToday, inflation, years)
}

export interface PensionIncomeAtAge {
  /** 국민연금 연 수령액 (명목, 세전) */
  readonly nationalAnnual: number
  /** 기타 연금 연 수령액 (명목, 세전) */
  readonly otherAnnual: number
  readonly grossAnnual: number
  /** 국민연금에 대한 실효 소득세 (근사) */
  readonly tax: number
}

export function pensionIncomeAt(
  age: number,
  national: NationalPensionPlan,
  other: OtherPensionPlan,
  currentAge: number,
  inflation: number,
  adjustment: number,
): PensionIncomeAtAge {
  const nationalAnnual = nationalPensionAt(age, national, currentAge, inflation, adjustment) * 12
  const otherAnnual = otherPensionAt(age, other, currentAge, inflation) * 12
  return {
    nationalAnnual,
    otherAnnual,
    grossAnnual: nationalAnnual + otherAnnual,
    // 기타 연금은 상품별 과세가 달라 0으로 두고 가정 패널에 한계로 고지한다.
    tax: nationalAnnual * national.effectiveTaxRate,
  }
}
