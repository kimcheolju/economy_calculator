/**
 * 계좌 인출 공통 로직 (design/02-calculation-engine.md §7.3)
 *
 * 축적기의 일회성 유출 이벤트와 인출기 시뮬레이션이 공유한다.
 * 검토판 §2.4: 55세 이전에는 연금저축·IRP를 인출할 수 없다는 제약을 강제한다.
 */

import type { TaxRuleSet } from '@/data/tax/types'
import type { AccountState, AccountType, EtfKind } from './types'
import { ACCOUNT_TYPES } from './types'
import { taxOnWithdrawal, type WithdrawalTaxContext } from './tax/withdrawal'
import { emptyAllocation, type Allocation } from './allocate'

/** 해당 나이에 인출 가능한 계좌인가 (연금계좌 55세 제약) */
export function isAccessible(account: AccountType, age: number, rules: TaxRuleSet): boolean {
  const minAge = rules.pensionAccount.minAge.value.age
  if (account === 'pensionSavings' || account === 'irp' || account === 'dcRetirement') {
    return age >= minAge
  }
  return true
}

export function accessibleAccounts(age: number, rules: TaxRuleSet): AccountType[] {
  return ACCOUNT_TYPES.filter((a) => isAccessible(a, age, rules))
}

/** 연 단위로 유지되는 과세 누적 상태 */
export interface YearTaxState {
  remainingForeignDeduction: number
  privatePensionIncomeThisYear: number
}

export function createYearTaxState(etfKind: EtfKind, rules: TaxRuleSet): YearTaxState {
  return {
    remainingForeignDeduction: rules.etf[etfKind].value.annualDeduction,
    privatePensionIncomeThisYear: 0,
  }
}

export interface DrawResult {
  readonly withdrawnByAccount: Allocation
  readonly totalWithdrawn: number
  readonly tax: number
  readonly realizedFinancialIncome: number
  readonly privatePensionIncome: number
  /** 잔액이 부족해 인출하지 못한 금액 */
  readonly shortfall: number
}

/**
 * 우선순위에 따라 목표 금액을 인출하고 세금을 계산한다.
 * `accounts` 와 `yearTax` 는 제자리에서 변형된다 (성능 — Monte Carlo에서 수백만 회 호출).
 */
export function drawFromAccounts(
  target: number,
  accounts: Record<AccountType, AccountState>,
  priority: readonly AccountType[],
  opts: {
    age: number
    etfKind: EtfKind
    rules: TaxRuleSet
    pensionYearIndex: number
    retirementIncomeTaxRate: number
  },
  yearTax: YearTaxState,
): DrawResult {
  const withdrawnByAccount = emptyAllocation()
  let totalWithdrawn = 0
  let tax = 0
  let realizedFinancialIncome = 0
  let privatePensionIncome = 0
  let remaining = target

  if (target <= 0) {
    return { withdrawnByAccount, totalWithdrawn: 0, tax: 0, realizedFinancialIncome: 0, privatePensionIncome: 0, shortfall: 0 }
  }

  // 우선순위에 없는 계좌도 마지막에 시도한다 (잔액을 버리지 않기 위해)
  const order: AccountType[] = [...priority, ...ACCOUNT_TYPES.filter((a) => !priority.includes(a))]

  for (const account of order) {
    if (remaining <= 1e-6) break
    if (!isAccessible(account, opts.age, opts.rules)) continue

    const state = accounts[account]
    if (state.balance <= 1e-6) continue

    const amount = Math.min(remaining, state.balance)

    const ctx: WithdrawalTaxContext = {
      age: opts.age,
      etfKind: opts.etfKind,
      rules: opts.rules,
      remainingForeignDeduction: yearTax.remainingForeignDeduction,
      privatePensionIncomeThisYear: yearTax.privatePensionIncomeThisYear,
      pensionYearIndex: opts.pensionYearIndex,
      retirementIncomeTaxRate: opts.retirementIncomeTaxRate,
    }

    const result = taxOnWithdrawal(account, amount, state, ctx)

    // 취득원가를 비례 차감한다
    const basisShare = state.balance > 0 ? state.costBasis / state.balance : 0
    const deductedShare = state.balance > 0 ? state.deductedPrincipal / state.balance : 0
    const nonDeductedShare = state.balance > 0 ? state.nonDeductedPrincipal / state.balance : 0

    state.costBasis = Math.max(0, state.costBasis - amount * basisShare)
    state.deductedPrincipal = Math.max(0, state.deductedPrincipal - amount * deductedShare)
    state.nonDeductedPrincipal = Math.max(0, state.nonDeductedPrincipal - amount * nonDeductedShare)
    state.balance = Math.max(0, state.balance - amount)
    state.taxPaidCumulative += result.tax

    withdrawnByAccount[account] += amount
    totalWithdrawn += amount
    tax += result.tax
    realizedFinancialIncome += result.realizedFinancialIncome
    privatePensionIncome += result.privatePensionIncome

    yearTax.remainingForeignDeduction = Math.max(0, yearTax.remainingForeignDeduction - result.usedForeignDeduction)
    yearTax.privatePensionIncomeThisYear += result.privatePensionIncome

    remaining -= amount
  }

  return {
    withdrawnByAccount,
    totalWithdrawn,
    tax,
    realizedFinancialIncome,
    privatePensionIncome,
    shortfall: Math.max(0, remaining),
  }
}

export function cloneAccounts(accounts: Record<AccountType, AccountState>): Record<AccountType, AccountState> {
  const out = {} as Record<AccountType, AccountState>
  for (const a of ACCOUNT_TYPES) out[a] = { ...accounts[a] }
  return out
}

export function emptyAccountState(): AccountState {
  return {
    balance: 0,
    costBasis: 0,
    deductedPrincipal: 0,
    nonDeductedPrincipal: 0,
    totalContributed: 0,
    taxPaidCumulative: 0,
  }
}

export function totalBalance(accounts: Record<AccountType, AccountState>): number {
  let sum = 0
  for (const a of ACCOUNT_TYPES) sum += accounts[a].balance
  return sum
}
