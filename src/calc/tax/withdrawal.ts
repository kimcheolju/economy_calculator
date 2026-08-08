/**
 * 인출기 과세 (design/03-tax-and-accounts.md §4, 검토판 §2.2)
 *
 * 원안 5번은 축적 단계 세금만 다뤘다. 그런데 "매달 쓸 수 있는 돈"은 세후여야
 * 의미가 있고, 인출 단계 세금은 계좌 유형별로 전혀 다르다.
 */

import type { TaxRuleSet } from '@/data/tax/types'
import type { AccountState, AccountType, EtfKind } from '../types'

export interface WithdrawalTaxContext {
  age: number
  etfKind: EtfKind
  rules: TaxRuleSet
  /** 해외상장 ETF 연 250만원 기본공제의 해당 연도 잔여액 */
  remainingForeignDeduction: number
  /** 해당 연도 사적연금(연금저축·IRP) 누적 인출액 — 1,500만원 분리과세 한도 판정 */
  privatePensionIncomeThisYear: number
  /** 연금 수령 연차 (1-based) — 연금수령한도 계산용 */
  pensionYearIndex: number
  /** DC·퇴직금 실효 퇴직소득세율 (사용자 입력) */
  retirementIncomeTaxRate: number
}

export interface WithdrawalTaxResult {
  readonly tax: number
  /** 이 인출로 실현된 금융소득 (건강보험료 소득 인정액 계산용) */
  readonly realizedFinancialIncome: number
  /** 소비된 해외상장 ETF 기본공제액 */
  readonly usedForeignDeduction: number
  /** 사적연금 소득으로 인정되는 금액 */
  readonly privatePensionIncome: number
}

const ZERO: WithdrawalTaxResult = {
  tax: 0,
  realizedFinancialIncome: 0,
  usedForeignDeduction: 0,
  privatePensionIncome: 0,
}

/** 인출액에 포함된 평가이익 비율 */
export function gainRatio(state: AccountState): number {
  if (state.balance <= 0) return 0
  const gain = Math.max(0, state.balance - state.costBasis)
  return Math.min(1, gain / state.balance)
}

/** 연령별 연금소득세율 */
export function pensionWithdrawalRate(age: number, rules: TaxRuleSet): number {
  const r = rules.pensionAccount.withdrawalRates.value
  if (age < 70) return r.under70
  if (age < 80) return r.under80
  return r.over80
}

/**
 * 연금수령한도 = 평가액 / (11 − 연금수령연차) × 1.2
 * 한도를 초과해 인출하면 초과분은 연금소득세가 아닌 기타소득세로 과세된다.
 */
export function pensionAnnualLimit(balance: number, pensionYearIndex: number, rules: TaxRuleSet): number {
  const f = rules.pensionAccount.annualLimitFactor.value
  const divisor = f.divisorBase - pensionYearIndex
  if (divisor <= 0) return Number.POSITIVE_INFINITY
  return (balance / divisor) * f.multiplier
}

/** 일반계좌 인출 과세 — 인출액 중 차익분에만 과세 */
function taxTaxableAccount(
  amount: number,
  state: AccountState,
  ctx: WithdrawalTaxContext,
): WithdrawalTaxResult {
  const etf = ctx.rules.etf[ctx.etfKind].value
  const taxableGain = amount * gainRatio(state)
  if (taxableGain <= 0 || etf.capitalGainsRate <= 0) {
    return { ...ZERO, realizedFinancialIncome: taxableGain }
  }

  // 기본공제는 해외상장 ETF(양도소득)에만 있다.
  // 국내상장 해외ETF 매매차익은 배당소득이므로 공제가 없다 — 혼동하기 쉬운 지점.
  const deduction = Math.min(etf.annualDeduction > 0 ? ctx.remainingForeignDeduction : 0, taxableGain)
  const base = Math.max(0, taxableGain - deduction)

  return {
    tax: base * etf.capitalGainsRate,
    realizedFinancialIncome: taxableGain,
    usedForeignDeduction: deduction,
    privatePensionIncome: 0,
  }
}

/** 연금저축·IRP 인출 과세 */
function taxPensionAccount(
  amount: number,
  state: AccountState,
  ctx: WithdrawalTaxContext,
): WithdrawalTaxResult {
  if (state.balance <= 0) return ZERO

  const gain = Math.max(0, state.balance - state.costBasis)
  // 과세 대상 = 세액공제 받은 원금 + 운용수익. 세액공제 받지 않은 원금은 비과세.
  const taxableShare = Math.min(1, (state.deductedPrincipal + gain) / state.balance)
  const taxablePortion = amount * taxableShare

  const p = ctx.rules.pensionAccount
  const baseRate = pensionWithdrawalRate(ctx.age, ctx.rules)

  // 사적연금 연 1,500만원 초과 시: 종합과세 또는 16.5% 분리과세 선택.
  // 다른 소득을 알 수 없으므로 16.5% 분리과세로 보수적 계산한다.
  const totalPrivate = ctx.privatePensionIncomeThisYear + taxablePortion
  const overThreshold = totalPrivate > p.separateTaxThreshold.value.amount
  const rate = overThreshold ? p.separateTaxRate.value.rate : baseRate

  let tax = taxablePortion * rate

  // 연금수령한도 초과분은 기타소득세율로 추가 과세
  const limit = pensionAnnualLimit(state.balance, ctx.pensionYearIndex, ctx.rules)
  if (Number.isFinite(limit) && amount > limit) {
    const excessTaxable = (amount - limit) * taxableShare
    const extraRate = Math.max(0, p.earlyWithdrawalRate.value.rate - rate)
    tax += excessTaxable * extraRate
  }

  return {
    tax,
    realizedFinancialIncome: 0,
    usedForeignDeduction: 0,
    privatePensionIncome: taxablePortion,
  }
}

/** DC·퇴직금 인출 과세 — 연금 수령 시 퇴직소득세 감면 */
function taxDcRetirement(
  amount: number,
  ctx: WithdrawalTaxContext,
): WithdrawalTaxResult {
  const p = ctx.rules.pensionAccount
  const discount =
    ctx.pensionYearIndex <= 10
      ? p.retirementPensionDiscountWithin10.value.ratio
      : p.retirementPensionDiscountAfter10.value.ratio
  return {
    ...ZERO,
    tax: amount * ctx.retirementIncomeTaxRate * discount,
  }
}

/** 계좌 유형별 인출 과세 디스패치 */
export function taxOnWithdrawal(
  account: AccountType,
  amount: number,
  state: AccountState,
  ctx: WithdrawalTaxContext,
): WithdrawalTaxResult {
  if (amount <= 0) return ZERO
  switch (account) {
    case 'taxable':
      return taxTaxableAccount(amount, state, ctx)
    case 'isa':
      // ISA는 은퇴 시점에 일괄 정산되어 일반계좌로 이관되므로 인출기에는 잔액이 없다.
      return taxTaxableAccount(amount, state, ctx)
    case 'pensionSavings':
    case 'irp':
      return taxPensionAccount(amount, state, ctx)
    case 'dcRetirement':
      return taxDcRetirement(amount, ctx)
  }
}

export interface IsaSettlement {
  readonly tax: number
  readonly netBalance: number
  readonly exemptLimit: number
  readonly netProfit: number
  readonly holdingRequirementMet: boolean
}

/**
 * ISA 만기 정산 (은퇴 시점에 1회).
 * 순이익에서 비과세 한도를 차감하고 초과분에 9.9% 분리과세.
 * 정산 후 잔액은 일반계좌로 이관하고 취득원가를 전액 원금화한다.
 */
export function settleIsa(
  state: AccountState,
  isaType: 'general' | 'lowIncome',
  holdingYears: number,
  rules: TaxRuleSet,
): IsaSettlement {
  const netProfit = Math.max(0, state.balance - state.totalContributed)
  const requirementMet = holdingYears >= rules.isa.minHoldingYears.value.years

  // 의무가입기간 미충족 시 혜택 상실 → 비과세 한도 0, 일반 배당소득세율 적용
  const exemptLimit = requirementMet
    ? isaType === 'general'
      ? rules.isa.exemptGeneral.value.amount
      : rules.isa.exemptLowIncome.value.amount
    : 0
  const rate = requirementMet ? rules.isa.excessRate.value.rate : rules.dividendWithholding.value.rate

  const taxable = Math.max(0, netProfit - exemptLimit)
  const tax = taxable * rate

  return {
    tax,
    netBalance: Math.max(0, state.balance - tax),
    exemptLimit,
    netProfit,
    holdingRequirementMet: requirementMet,
  }
}
