/**
 * 계산 엔진 오케스트레이션 (design/README.md §4, design/02 §11)
 *
 * CLAUDE.md R-4: 순수 함수. 현재 시각은 인자로 받는다.
 */

import type { TaxRuleSet } from '@/data/tax/types'
import { accountsFromAccumulation, accumulate } from './accumulate'
import { buildAssumptions } from './assumptions'
import { createYearTaxState, drawFromAccounts, totalBalance } from './draw'
import { calcFire } from './fire'
import { money, normalizeReturns } from './rates'
import { buildWarnings } from './warnings'
import { withdraw } from './withdraw'
import type {
  AccountState,
  AccountType,
  AccumulationResult,
  CalculationResult,
  CalculatorInput,
  DebtSettlement,
} from './types'

export interface RunOptions {
  /** 계산 실행 시각 (ISO 날짜). 엔진은 Date 를 모른다. */
  computedAtIso?: string
  /** 연도별 명목 총수익률 — 축적기 + 인출기 전체 (Monte Carlo용) */
  returnsOverride?: readonly number[]
  /** 축적기를 연 단위로 근사 (Monte Carlo 성능 옵션) */
  annualApprox?: boolean
}

/**
 * 은퇴 시점 부채 정산. `accounts` 를 제자리에서 줄인다.
 *
 * 세금까지 포함해 부채를 완제하려면 인출액이 부채보다 커야 하므로 한 번 인출한 뒤
 * 부족분을 다시 인출한다. 두 번이면 실무상 충분하다(세율 < 100%).
 */
function settleDebt(
  accounts: Record<AccountType, AccountState>,
  accumulation: AccumulationResult,
  input: CalculatorInput,
  rules: TaxRuleSet,
): DebtSettlement {
  const inflation = input.returns.inflation
  const years = Math.max(0, input.basic.retirementAge - input.basic.currentAge)
  const owed = accumulation.debt.balanceAtRetirement

  if (owed <= 0) {
    return {
      balanceAtRetirement: 0,
      paid: 0,
      tax: 0,
      shortfall: 0,
      netBalance: money(totalBalance(accounts), inflation, years),
    }
  }

  const yearTax = createYearTaxState(input.accounts.etfKind, rules)
  const drawOpts = {
    age: input.basic.retirementAge,
    etfKind: input.accounts.etfKind,
    rules,
    pensionYearIndex: 1,
    retirementIncomeTaxRate: input.accounts.retirementIncomeTaxRate,
  }

  let paid = 0
  let tax = 0
  let remaining = owed

  for (let pass = 0; pass < 2 && remaining > 1e-6; pass++) {
    const drawn = drawFromAccounts(remaining + tax - paid, accounts, input.retirement.withdrawalPriority, drawOpts, yearTax)
    if (drawn.totalWithdrawn <= 1e-6) break
    // 인출액 중 세금을 뺀 나머지가 실제로 빚을 갚는 데 쓰인다
    const applied = Math.max(0, drawn.totalWithdrawn - drawn.tax)
    paid += Math.min(applied, remaining)
    tax += drawn.tax
    remaining = Math.max(0, owed - paid)
  }

  return {
    balanceAtRetirement: owed,
    paid,
    tax,
    shortfall: remaining,
    netBalance: money(totalBalance(accounts), inflation, years),
  }
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

  /*
   * 은퇴 시점에 남은 빚은 은퇴 자산으로 갚는다 (design/02 §12).
   * 갚지 않고 두면 이후 모든 계산이 실제보다 좋게 나온다 — 이 계산기가
   * 가장 피해야 할 실패 방향이다. 인출과 같은 경로를 쓰므로 매도 차익·연금
   * 인출에 붙는 세금이 정확히 반영된다.
   */
  const accountsAfterDebt = accountsFromAccumulation(accumulation)
  const debtSettlement = settleDebt(accountsAfterDebt, accumulation, input, rules)

  const withdrawal = withdraw(accountsAfterDebt, input, rules, {
    returnsOverride: withdrawalReturns,
  })

  const fire = calcFire(input, rules, accountsAfterDebt, withdrawal.firstYearMonthlyNet.real)

  return {
    input,
    normalizedReturns: normalized,
    accumulation,
    debtSettlement,
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
export * from './debt'
export * from './solve'
export * from './scenario'
export * from './montecarlo'
