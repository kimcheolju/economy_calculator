/**
 * 계산 엔진 오케스트레이션 (design/README.md §4, design/02 §11)
 *
 * CLAUDE.md R-4: 순수 함수. 현재 시각은 인자로 받는다.
 */

import type { TaxRuleSet } from '@/data/tax/types'
import { accountsFromAccumulation, accumulate } from './accumulate'
import { buildAssumptions } from './assumptions'
import { calcFire } from './fire'
import { normalizeReturns } from './rates'
import { buildWarnings } from './warnings'
import { withdraw } from './withdraw'
import type { CalculationResult, CalculatorInput } from './types'

export interface RunOptions {
  /** 계산 실행 시각 (ISO 날짜). 엔진은 Date 를 모른다. */
  computedAtIso?: string
  /** 연도별 명목 총수익률 — 축적기 + 인출기 전체 (Monte Carlo용) */
  returnsOverride?: readonly number[]
  /** 축적기를 연 단위로 근사 (Monte Carlo 성능 옵션) */
  annualApprox?: boolean
}

export function runFullSimulation(
  input: CalculatorInput,
  rules: TaxRuleSet,
  options: RunOptions = {},
): CalculationResult {
  const normalized = normalizeReturns(input.returns)
  const years = Math.max(0, input.basic.retirementAge - input.basic.currentAge)

  const accumulationReturns = options.returnsOverride?.slice(0, years)
  const withdrawalReturns = options.returnsOverride?.slice(years)

  const accumulation = accumulate(input, normalized, rules, {
    returnsOverride: accumulationReturns,
    annualApprox: options.annualApprox,
  })

  const withdrawal = withdraw(accountsFromAccumulation(accumulation), input, rules, {
    returnsOverride: withdrawalReturns,
  })

  const fire = calcFire(input, rules, accumulation.finalAccounts, withdrawal.firstYearMonthlyNet.real)

  return {
    input,
    normalizedReturns: normalized,
    accumulation,
    withdrawal,
    fire,
    assumptions: buildAssumptions(input, normalized, rules),
    warnings: buildWarnings(input, normalized, rules, accumulation, withdrawal, fire),
    computedAtIso: options.computedAtIso ?? '',
  }
}

export * from './types'
export { accumulate, accountsFromAccumulation } from './accumulate'
export { withdraw, settleAtRetirement, strategyAmount, buildPhases } from './withdraw'
export { calcFire, netFromGross, solveGross } from './fire'
export { normalizeReturns } from './rates'
export * from './rates'
export * from './allocate'
export * from './draw'
export * from './solve'
export * from './scenario'
export * from './montecarlo'
