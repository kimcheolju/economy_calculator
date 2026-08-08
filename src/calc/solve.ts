/**
 * 역산 솔버 (design/02-calculation-engine.md §8, 검토판 §2.8)
 *
 * 원안은 전부 정방향(납입 → 결과) 계산이지만, 사용자의 실제 질문은 대개 역방향이다.
 * "목표를 위해 매달 얼마를 넣어야 하나?"
 *
 * 전부 이분법으로 구현한다. 세금·한도 배분 때문에 미세한 비단조 구간이 생길 수 있으므로
 * 해를 찾지 못하면 null 을 반환한다.
 */

import type { TaxRuleSet } from '@/data/tax/types'
import { bisect } from '@/lib/bisect'
import { runFullSimulation } from './index'
import type { CalculatorInput } from './types'

export type SolverKind = 'monthlyContribution' | 'requiredReturn' | 'earliestRetirementAge'

export interface SolverResult {
  readonly kind: SolverKind
  readonly value: number | null
  readonly achievedRatio: number | null
  readonly label: string
  readonly note?: string
}

function achievement(input: CalculatorInput, rules: TaxRuleSet): number {
  const result = runFullSimulation(input, rules)
  return result.fire.achievementBySpend
}

/** 목표 달성에 필요한 월 납입액 */
export function solveMonthlyContribution(input: CalculatorInput, rules: TaxRuleSet): SolverResult {
  const f = (contribution: number) =>
    achievement({ ...input, accounts: { ...input.accounts, monthlyContribution: contribution } }, rules) - 1

  if (f(0) >= 0) {
    return {
      kind: 'monthlyContribution',
      value: 0,
      achievedRatio: achievement({ ...input, accounts: { ...input.accounts, monthlyContribution: 0 } }, rules),
      label: '추가 납입 없이도 목표를 달성합니다',
    }
  }

  const value = bisect(f, { lo: 0, hi: 50_000_000, tol: 1000, maxIter: 60 })
  return {
    kind: 'monthlyContribution',
    value,
    achievedRatio:
      value === null
        ? null
        : achievement({ ...input, accounts: { ...input.accounts, monthlyContribution: value } }, rules),
    label: '목표 달성에 필요한 월 납입액',
    note: value === null ? '월 5,000만원 이내로는 목표를 달성할 수 없습니다.' : undefined,
  }
}

/** 현재 납입액으로 목표를 달성하기 위해 필요한 연평균 수익률 */
export function solveRequiredReturn(input: CalculatorInput, rules: TaxRuleSet): SolverResult {
  const f = (totalReturn: number) => {
    const returns = { ...input.returns, mode: 'totalReturn' as const, totalReturn }
    return achievement({ ...input, returns }, rules) - 1
  }

  const value = bisect(f, { lo: -0.05, hi: 0.3, tol: 0.0001, maxIter: 80 })
  return {
    kind: 'requiredReturn',
    value,
    achievedRatio:
      value === null
        ? null
        : achievement({ ...input, returns: { ...input.returns, mode: 'totalReturn', totalReturn: value } }, rules),
    label: '목표 달성에 필요한 연평균 총수익률',
    note:
      value === null
        ? '연 30% 이내의 수익률로는 목표를 달성할 수 없습니다.'
        : value > 0.12
          ? '역사적 장기 평균을 크게 상회하는 수익률입니다.'
          : undefined,
  }
}

/**
 * 달성 가능한 가장 이른 은퇴 나이.
 * 정수 탐색이므로 선형 스캔으로 충분하다.
 */
export function solveEarliestRetirementAge(input: CalculatorInput, rules: TaxRuleSet): SolverResult {
  const start = input.basic.currentAge + 1
  const limit = 85

  for (let age = start; age <= limit; age++) {
    if (age >= input.basic.endAge) break
    const candidate: CalculatorInput = { ...input, basic: { ...input.basic, retirementAge: age } }
    if (achievement(candidate, rules) >= 1) {
      return {
        kind: 'earliestRetirementAge',
        value: age,
        achievedRatio: achievement(candidate, rules),
        label: '목표를 달성할 수 있는 가장 이른 은퇴 나이',
      }
    }
  }

  return {
    kind: 'earliestRetirementAge',
    value: null,
    achievedRatio: null,
    label: '목표를 달성할 수 있는 가장 이른 은퇴 나이',
    note: `${limit}세까지 투자해도 현재 조건으로는 목표를 달성할 수 없습니다.`,
  }
}

export function runAllSolvers(input: CalculatorInput, rules: TaxRuleSet): SolverResult[] {
  return [
    solveMonthlyContribution(input, rules),
    solveRequiredReturn(input, rules),
    solveEarliestRetirementAge(input, rules),
  ]
}
