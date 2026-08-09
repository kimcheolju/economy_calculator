/**
 * 파생 계산 훅 (design/04-data-model.md §5)
 *
 * 재계산 정책:
 * - 기본 계산은 동기 실행 (목표 <50ms). 디바운스 불필요.
 * - 입력이 검증 실패해도 lastValidResult 를 계속 표시 → 화면이 비어버리지 않는다.
 */

import { useEffect, useMemo, useRef } from 'react'
import { runFullSimulation } from '@/calc'
import { runScenarios, type ScenarioResult } from '@/calc/scenario'
import { runAllSolvers, solveMonthlyContribution, type SolverResult } from '@/calc/solve'
import type { CalculationResult } from '@/calc/types'
import { resolveRuleSet, type TaxOverrideKey } from '@/data/tax'
import type { TaxRuleSet } from '@/data/tax/types'
import { useCalculatorStore } from './calculator'

export function useRuleSet(): TaxRuleSet {
  const options = useCalculatorStore((s) => s.input.options)
  return useMemo(
    () =>
      resolveRuleSet({
        taxRuleSetId: options.taxRuleSetId,
        applyProposedRules: options.applyProposedRules,
        taxOverrides: options.taxOverrides as Partial<Record<TaxOverrideKey, number>> | undefined,
      }),
    [options],
  )
}

export interface ResultState {
  result: CalculationResult | null
  /** 입력이 유효하지 않아 이전 결과를 보여주는 중인지 */
  isStale: boolean
  hasErrors: boolean
}

export function useResult(): ResultState {
  const input = useCalculatorStore((s) => s.input)
  const errors = useCalculatorStore((s) => s.validationErrors)
  const rules = useRuleSet()
  const lastValid = useRef<CalculationResult | null>(null)

  const hasErrors = Object.keys(errors).length > 0

  const computed = useMemo(() => {
    if (hasErrors) return null
    try {
      return runFullSimulation(input, rules, { computedAtIso: new Date().toISOString() })
    } catch {
      return null
    }
  }, [input, rules, hasErrors])

  useEffect(() => {
    if (computed) lastValid.current = computed
  }, [computed])

  const result = computed ?? lastValid.current
  return { result, isStale: computed === null && result !== null, hasErrors }
}

/** 시나리오 비교 — 명시적으로 열었을 때만 계산한다 */
export function useScenarios(enabled: boolean): ScenarioResult[] | null {
  const input = useCalculatorStore((s) => s.input)
  const errors = useCalculatorStore((s) => s.validationErrors)
  const rules = useRuleSet()

  return useMemo(() => {
    if (!enabled || Object.keys(errors).length > 0) return null
    try {
      return runScenarios(input, rules)
    } catch {
      return null
    }
  }, [enabled, input, rules, errors])
}

/**
 * 목표 달성에 필요한 월 납입액.
 *
 * 역산 솔버 전체(`useSolvers`)와 달리 이것만은 버튼 뒤에 두지 않는다 —
 * "얼마를 받나"만큼이나 "얼마를 넣어야 하나"가 사용자의 1순위 질문이기 때문이다.
 * 이분법 한 번은 실측 약 4ms(전체 시뮬레이션 1회 ≈ 1ms × 16회)라 매 입력마다 돌려도 된다.
 */
export function useRequiredContribution(): SolverResult | null {
  const input = useCalculatorStore((s) => s.input)
  const errors = useCalculatorStore((s) => s.validationErrors)
  const rules = useRuleSet()

  return useMemo(() => {
    if (Object.keys(errors).length > 0) return null
    try {
      return solveMonthlyContribution(input, rules)
    } catch {
      return null
    }
  }, [input, rules, errors])
}

/** 역산 솔버 — 명시적으로 열었을 때만 계산한다 (전체 시뮬레이션을 수십 번 반복) */
export function useSolvers(enabled: boolean): SolverResult[] | null {
  const input = useCalculatorStore((s) => s.input)
  const errors = useCalculatorStore((s) => s.validationErrors)
  const rules = useRuleSet()

  return useMemo(() => {
    if (!enabled || Object.keys(errors).length > 0) return null
    try {
      return runAllSolvers(input, rules)
    } catch {
      return null
    }
  }, [enabled, input, rules, errors])
}
