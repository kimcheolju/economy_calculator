/**
 * 시나리오 비교 (design/02-calculation-engine.md §9)
 *
 * 원안 6번: 보수적 / 기준 / 낙관적 시나리오를 비교할 수 있게 한다.
 * 오프셋은 가격상승률에 적용하고 배당수익률은 유지한다 (배당은 상대적으로 안정적).
 */

import type { TaxRuleSet } from '@/data/tax/types'
import { runFullSimulation } from './index'
import { normalizeReturns } from './rates'
import type { CalculationResult, CalculatorInput } from './types'

export type ScenarioKey = 'conservative' | 'base' | 'optimistic'

export const SCENARIO_LABELS: Readonly<Record<ScenarioKey, string>> = {
  conservative: '보수적',
  base: '기준',
  optimistic: '낙관적',
}

export interface ScenarioResult {
  readonly key: ScenarioKey
  readonly label: string
  readonly totalReturn: number
  readonly inflation: number
  readonly result: CalculationResult
}

export function applyScenario(input: CalculatorInput, key: ScenarioKey): CalculatorInput {
  const { returnOffset, inflationOffset } = input.options.scenarioOffsets
  const normalized = normalizeReturns(input.returns)

  let priceOffset = 0
  let infOffset = 0
  if (key === 'conservative') {
    priceOffset = -returnOffset
    infOffset = inflationOffset
  } else if (key === 'optimistic') {
    priceOffset = returnOffset
  }

  return {
    ...input,
    returns: {
      ...input.returns,
      mode: 'split',
      priceReturn: normalized.priceReturn + priceOffset,
      dividendYield: normalized.dividendYield,
      inflation: Math.max(0, input.returns.inflation + infOffset),
    },
  }
}

export function runScenarios(input: CalculatorInput, rules: TaxRuleSet): ScenarioResult[] {
  const keys: ScenarioKey[] = ['conservative', 'base', 'optimistic']
  return keys.map((key) => {
    const scenarioInput = applyScenario(input, key)
    const normalized = normalizeReturns(scenarioInput.returns)
    return {
      key,
      label: SCENARIO_LABELS[key],
      totalReturn: normalized.totalReturn,
      inflation: scenarioInput.returns.inflation,
      result: runFullSimulation(scenarioInput, rules),
    }
  })
}
