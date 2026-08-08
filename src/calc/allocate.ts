/**
 * 계좌 배분 (design/02-calculation-engine.md §2)
 *
 * 검토판 §2.5: 단일 계좌 선택이 아니라 다중 계좌 + 오버플로 배분.
 * 월 300만원(연 3,600만원)을 '연금저축'에 다 넣을 수는 없다 (한도 1,800만원).
 */

import type { TaxRuleSet } from '@/data/tax/types'
import type { AccountPlan, AccountType, SalaryBracket } from './types'
import { ACCOUNT_TYPES } from './types'

/** 연 단위로 추적되는 한도 소진 상태 */
export interface LimitState {
  /** 연금저축 + IRP 합산 납입액 (해당 연도) */
  pensionCombinedUsed: number
  /** 연금저축 납입액 (해당 연도) — 세액공제 한도 판정용 */
  pensionSavingsUsed: number
  /** 세액공제 대상으로 인정된 누적 납입액 (해당 연도) */
  creditEligibleUsed: number
  /** ISA 해당 연도 납입액 */
  isaAnnualUsed: number
  /** ISA 누적 납입액 (총 한도 2억원) */
  isaLifetimeUsed: number
}

export function createLimitState(isaLifetimeUsed = 0): LimitState {
  return {
    pensionCombinedUsed: 0,
    pensionSavingsUsed: 0,
    creditEligibleUsed: 0,
    isaAnnualUsed: 0,
    isaLifetimeUsed,
  }
}

export function resetAnnualLimits(state: LimitState): void {
  state.pensionCombinedUsed = 0
  state.pensionSavingsUsed = 0
  state.creditEligibleUsed = 0
  state.isaAnnualUsed = 0
}

export type Allocation = Record<AccountType, number>

export function emptyAllocation(): Allocation {
  return { taxable: 0, isa: 0, pensionSavings: 0, irp: 0, dcRetirement: 0 }
}

/**
 * 세액공제 한도까지의 잔여 여력 (1차 패스).
 * 연금계좌는 여기서 세액공제 한도까지만 받는다 → 기본 우선순위가
 * "연금 세액공제 → ISA → 연금 추가 → 일반"이 되는 이유.
 */
function capacityCreditPass(account: AccountType, rules: TaxRuleSet, state: LimitState): number {
  const p = rules.pensionAccount
  switch (account) {
    case 'pensionSavings': {
      const creditRoom = Math.max(0, p.creditLimitSavings.value.amount - state.pensionSavingsUsed)
      const combinedCreditRoom = Math.max(0, p.creditLimitCombined.value.amount - state.creditEligibleUsed)
      const payRoom = Math.max(0, p.combinedAnnualLimit.value.amount - state.pensionCombinedUsed)
      return Math.min(creditRoom, combinedCreditRoom, payRoom)
    }
    case 'irp': {
      const combinedCreditRoom = Math.max(0, p.creditLimitCombined.value.amount - state.creditEligibleUsed)
      const payRoom = Math.max(0, p.combinedAnnualLimit.value.amount - state.pensionCombinedUsed)
      return Math.min(combinedCreditRoom, payRoom)
    }
    case 'isa':
      return capacityIsa(rules, state)
    case 'taxable':
    case 'dcRetirement':
      // taxable 은 마지막 오버플로에서만 채운다. dcRetirement 는 신규 납입 대상이 아니다.
      return 0
  }
}

/** 전체 납입한도까지의 잔여 여력 (2차 패스 — 세액공제를 넘는 추가 납입) */
function capacityFullPass(account: AccountType, rules: TaxRuleSet, state: LimitState): number {
  const p = rules.pensionAccount
  switch (account) {
    case 'pensionSavings':
    case 'irp':
      return Math.max(0, p.combinedAnnualLimit.value.amount - state.pensionCombinedUsed)
    case 'isa':
      return capacityIsa(rules, state)
    case 'taxable':
    case 'dcRetirement':
      return 0
  }
}

function capacityIsa(rules: TaxRuleSet, state: LimitState): number {
  const annualRoom = Math.max(0, rules.isa.annualLimit.value.amount - state.isaAnnualUsed)
  const lifetimeRoom = Math.max(0, rules.isa.lifetimeLimit.value.amount - state.isaLifetimeUsed)
  return Math.min(annualRoom, lifetimeRoom)
}

function commit(account: AccountType, amount: number, state: LimitState, creditEligible: boolean): void {
  if (amount <= 0) return
  switch (account) {
    case 'pensionSavings':
      state.pensionCombinedUsed += amount
      state.pensionSavingsUsed += amount
      if (creditEligible) state.creditEligibleUsed += amount
      break
    case 'irp':
      state.pensionCombinedUsed += amount
      if (creditEligible) state.creditEligibleUsed += amount
      break
    case 'isa':
      state.isaAnnualUsed += amount
      state.isaLifetimeUsed += amount
      break
    case 'taxable':
    case 'dcRetirement':
      break
  }
}

/**
 * 한 해의 납입액을 계좌별로 배분한다.
 *
 * 알고리즘: 우선순위 목록을 두 번 순회한다.
 *   1차 — 연금계좌는 세액공제 한도까지만, ISA는 전액 여력까지
 *   2차 — 연금계좌 추가 납입 (합산 1,800만원까지)
 *   마지막 — 남은 금액 전부 일반계좌 (오버플로)
 *
 * `deducted` 는 연금계좌 납입 중 세액공제를 받은 금액이며, 인출기 과세 계산에 쓰인다.
 */
export function allocateYear(
  annualContribution: number,
  plan: AccountPlan,
  rules: TaxRuleSet,
  state: LimitState,
): { allocation: Allocation; deducted: Allocation } {
  const allocation = emptyAllocation()
  const deducted = emptyAllocation()

  if (annualContribution <= 0) return { allocation, deducted }

  if (plan.allocationMode === 'manual' && plan.manualAllocation) {
    // 수동 배분: 사용자가 지정한 금액을 한도 내에서 그대로 적용하고, 초과분은 일반계좌로
    let overflow = 0
    for (const account of ACCOUNT_TYPES) {
      const requested = plan.manualAllocation[account] * 12
      if (requested <= 0) continue
      if (account === 'taxable') {
        allocation.taxable += requested
        continue
      }
      // 한도 여력은 반드시 commit 전에 계산한다 (commit 이 state 를 변형하므로)
      const cap = capacityFullPass(account, rules, state)
      const creditRoom = account === 'isa' ? 0 : capacityCreditPass(account, rules, state)
      const amount = Math.min(requested, cap)
      const creditPart = Math.min(amount, creditRoom)
      allocation[account] += amount
      commit(account, amount, state, false)
      if (creditPart > 0) {
        state.creditEligibleUsed += creditPart
        deducted[account] += creditPart
      }
      overflow += requested - amount
    }
    allocation.taxable += overflow
    return { allocation, deducted }
  }

  let remaining = annualContribution
  const priority = plan.allocationPriority.filter((a) => a !== 'taxable' && a !== 'dcRetirement')

  // 1차 패스: 세액공제 한도까지
  for (const account of priority) {
    if (remaining <= 0) break
    const cap = capacityCreditPass(account, rules, state)
    const amount = Math.min(remaining, cap)
    if (amount <= 0) continue
    allocation[account] += amount
    remaining -= amount
    const creditEligible = account !== 'isa'
    commit(account, amount, state, creditEligible)
    if (creditEligible) deducted[account] += amount
  }

  // 2차 패스: 연금계좌 추가 납입 (세액공제 없음)
  for (const account of priority) {
    if (remaining <= 0) break
    if (account === 'isa') continue
    const cap = capacityFullPass(account, rules, state)
    const amount = Math.min(remaining, cap)
    if (amount <= 0) continue
    allocation[account] += amount
    remaining -= amount
    commit(account, amount, state, false)
  }

  // 오버플로: 남은 금액은 항상 일반계좌
  allocation.taxable += remaining

  return { allocation, deducted }
}

/**
 * 연말정산 세액공제 환급액.
 * 환급금은 다음 연도에 발생하므로 호출자가 year+1 납입에 가산한다.
 */
export function taxCreditForYear(deducted: Allocation, bracket: SalaryBracket, rules: TaxRuleSet): number {
  const p = rules.pensionAccount
  const rate = bracket === 'under55m' ? p.creditRateLow.value.rate : p.creditRateHigh.value.rate
  const savingsEligible = Math.min(deducted.pensionSavings, p.creditLimitSavings.value.amount)
  const totalEligible = Math.min(savingsEligible + deducted.irp, p.creditLimitCombined.value.amount)
  return totalEligible * rate
}

/**
 * 일회성 유입금을 계좌에 배분한다 (한도 고려, 초과분은 일반계좌).
 * 퇴직금 수령·상속 등에 사용.
 */
export function allocateLumpSum(
  amount: number,
  plan: AccountPlan,
  rules: TaxRuleSet,
  state: LimitState,
): Allocation {
  const { allocation } = allocateYear(amount, { ...plan, allocationMode: 'auto' }, rules, state)
  return allocation
}
