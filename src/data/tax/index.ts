import type { RuleStatus, Sourced, TaxRuleSet } from './types'
import { KR_2026 } from './kr-2026'

export type { RuleStatus, Sourced, TaxRuleSet }
export { KR_2026 }

export const RULE_SETS: readonly TaxRuleSet[] = [KR_2026]
export const DEFAULT_RULE_SET_ID = 'kr-2026'

export function getRuleSet(id: string = DEFAULT_RULE_SET_ID): TaxRuleSet {
  const found = RULE_SETS.find((r) => r.id === id)
  if (!found) throw new Error(`알 수 없는 세제 룰셋: ${id}`)
  return found
}

/**
 * 개정안(status: 'proposed') 적용 토글.
 * 원본을 변형하지 않고 새 객체를 반환한다 (테스트 D-10).
 */
export function applyProposed(rules: TaxRuleSet): TaxRuleSet {
  return {
    ...rules,
    label: `${rules.label} (개정안 적용)`,
    isa: {
      ...rules.isa,
      exemptGeneral: rules.proposed.isaExemptGeneral,
      exemptLowIncome: rules.proposed.isaExemptLowIncome,
    },
  }
}

/** 사용자가 오버라이드할 수 있는 세율 키 */
export type TaxOverrideKey =
  | 'dividendWithholdingRate'
  | 'isaExcessRate'
  | 'pensionWithdrawalRateUnder70'
  | 'healthInsuranceRate'
  | 'nationalPensionEffectiveTaxRate'

function override<T>(base: Sourced<T>, value: T): Sourced<T> {
  return { ...base, value, status: 'approximation', note: '사용자 지정값' }
}

/**
 * 고급 설정의 세율 오버라이드를 적용한다.
 * 오버라이드된 항목은 가정 패널에서 '사용자 지정' 배지로 구분된다.
 */
export function applyOverrides(
  rules: TaxRuleSet,
  overrides: Partial<Record<TaxOverrideKey, number>> | undefined,
): TaxRuleSet {
  if (!overrides || Object.keys(overrides).length === 0) return rules

  let next: TaxRuleSet = rules

  if (overrides.dividendWithholdingRate !== undefined) {
    next = {
      ...next,
      dividendWithholding: override(next.dividendWithholding, { rate: overrides.dividendWithholdingRate }),
    }
  }
  if (overrides.isaExcessRate !== undefined) {
    next = { ...next, isa: { ...next.isa, excessRate: override(next.isa.excessRate, { rate: overrides.isaExcessRate }) } }
  }
  if (overrides.pensionWithdrawalRateUnder70 !== undefined) {
    const cur = next.pensionAccount.withdrawalRates.value
    next = {
      ...next,
      pensionAccount: {
        ...next.pensionAccount,
        withdrawalRates: override(next.pensionAccount.withdrawalRates, {
          ...cur,
          under70: overrides.pensionWithdrawalRateUnder70,
        }),
      },
    }
  }
  if (overrides.healthInsuranceRate !== undefined) {
    next = {
      ...next,
      healthInsurance: { ...next.healthInsurance, rate: override(next.healthInsurance.rate, { rate: overrides.healthInsuranceRate }) },
    }
  }
  if (overrides.nationalPensionEffectiveTaxRate !== undefined) {
    next = {
      ...next,
      nationalPension: {
        ...next.nationalPension,
        effectiveTaxRate: override(next.nationalPension.effectiveTaxRate, {
          rate: overrides.nationalPensionEffectiveTaxRate,
        }),
      },
    }
  }

  return next
}

/** 입력 옵션으로부터 최종 룰셋을 해석한다 */
export function resolveRuleSet(opts: {
  taxRuleSetId?: string
  applyProposedRules?: boolean
  taxOverrides?: Partial<Record<TaxOverrideKey, number>>
}): TaxRuleSet {
  let rules = getRuleSet(opts.taxRuleSetId)
  if (opts.applyProposedRules) rules = applyProposed(rules)
  return applyOverrides(rules, opts.taxOverrides)
}
