/**
 * 축적기 월별 시뮬레이션 (design/02-calculation-engine.md §3)
 *
 * 계산 순서는 고정이다 (§3.2). 순서를 바꾸면 결과가 달라진다.
 */

import type { TaxRuleSet } from '@/data/tax/types'
import {
  monthlyDividendYield,
  monthlyFeeFactor,
  monthlyFromAnnual,
  money,
  toNominal,
} from './rates'
import { taxOnDividend } from './tax/accumulation'
import {
  allocateLumpSum,
  allocateYear,
  createLimitState,
  emptyAllocation,
  resetAnnualLimits,
  taxCreditForYear,
  type Allocation,
} from './allocate'
import { simulateDebt } from './debt'
import { createYearTaxState, drawFromAccounts, emptyAccountState, totalBalance } from './draw'
import {
  ACCOUNT_TYPES,
  type AccountState,
  type AccountType,
  type AccumulationResult,
  type CalculatorInput,
  type Milestone,
  type NormalizedReturns,
  type YearSnapshot,
} from './types'

const MILESTONE_YEARS = [5, 10, 15, 20, 30] as const

export interface AccumulateOptions {
  /**
   * 연도별 명목 총수익률 배열 (Monte Carlo용).
   * 주입되면 해당 연도의 총수익률로 가격상승률을 재계산한다 (배당수익률은 고정).
   * ADR-4: 결정론적 계산은 상수 배열을 주입한 특수 케이스다.
   */
  returnsOverride?: readonly number[]
  /** 축적기를 연 단위로 근사한다 (Monte Carlo 성능 옵션) */
  annualApprox?: boolean
}

function initAccounts(input: CalculatorInput): Record<AccountType, AccountState> {
  const accounts = {} as Record<AccountType, AccountState>
  for (const a of ACCOUNT_TYPES) {
    const initial = input.accounts.initialBalances[a] ?? 0
    accounts[a] = {
      ...emptyAccountState(),
      balance: initial,
      costBasis: initial,
      totalContributed: initial,
      // 기존 연금계좌 잔액은 세액공제를 받은 원금으로 간주한다 (보수적).
      deductedPrincipal: a === 'pensionSavings' || a === 'irp' || a === 'dcRetirement' ? initial : 0,
    }
  }
  return accounts
}

/**
 * 축적기 시뮬레이션.
 *
 * 월별 루프 순서 (월초 납입):
 *   1. 납입 → 2. 배당 발생 → 3. 원천징수 → 4. 재투자 → 5. 가격상승 → 6. 보수 차감
 */
export function accumulate(
  input: CalculatorInput,
  normalized: NormalizedReturns,
  rules: TaxRuleSet,
  options: AccumulateOptions = {},
): AccumulationResult {
  const { basic, returns, accounts: plan } = input
  const years = Math.max(0, basic.retirementAge - basic.currentAge)
  const inflation = returns.inflation

  const accounts = initAccounts(input)
  const limits = createLimitState()

  /*
   * 부채는 축적기와 나란히 흐른다.
   * "매달 투자할 돈"은 상환액을 이미 뺀 실투자 가능액이므로 여기서 다시 빼지 않는다.
   * 다만 상환이 끝나면 그만큼이 굳으므로, 사용자가 켜둔 경우 납입액에 가산한다.
   */
  const debt = simulateDebt(input.debt, basic.currentAge, basic.retirementAge, basic.endAge)

  const snapshots: YearSnapshot[] = []
  let totalPrincipal = 0
  for (const a of ACCOUNT_TYPES) totalPrincipal += input.accounts.initialBalances[a] ?? 0

  let totalTaxPaid = 0
  let totalTaxCredit = 0
  let totalDividendCashOut = 0

  let monthlyContribution = plan.monthlyContribution
  /** 전년도 세액공제 환급금 — 다음 연도 납입에 가산 (연말정산 시점 반영) */
  let pendingTaxCredit = 0

  const feeFactor = monthlyFeeFactor(returns.ter)
  const baseMonthlyPrice = monthlyFromAnnual(normalized.priceReturn)
  const monthlyDiv = monthlyDividendYield(normalized.dividendYield)

  for (let yearIndex = 0; yearIndex < years; yearIndex++) {
    const age = basic.currentAge + yearIndex

    // 해당 연도의 가격상승률 (Monte Carlo 경로 주입 지원)
    const overrideTotal = options.returnsOverride?.[yearIndex]
    const monthlyPrice =
      overrideTotal === undefined
        ? baseMonthlyPrice
        : monthlyFromAnnual(overrideTotal - normalized.dividendYield)

    // ── 연초: 일회성 유입/유출 이벤트 ────────────────────────────
    let eventTax = 0
    for (const ev of input.events) {
      if (ev.age !== age) continue
      const nominalAmount =
        ev.basis === 'real' ? toNominal(ev.amount, inflation, yearIndex) : ev.amount
      if (ev.direction === 'inflow') {
        const alloc = allocateLumpSum(nominalAmount, plan, rules, limits)
        for (const a of ACCOUNT_TYPES) {
          if (alloc[a] <= 0) continue
          accounts[a].balance += alloc[a]
          accounts[a].costBasis += alloc[a]
          accounts[a].totalContributed += alloc[a]
        }
        totalPrincipal += nominalAmount
      } else {
        const yearTax = createYearTaxState(plan.etfKind, rules)
        const res = drawFromAccounts(nominalAmount, accounts, input.retirement.withdrawalPriority, {
          age,
          etfKind: plan.etfKind,
          rules,
          pensionYearIndex: 1,
          retirementIncomeTaxRate: plan.retirementIncomeTaxRate,
        }, yearTax)
        eventTax += res.tax
        for (const a of ACCOUNT_TYPES) accounts[a].balance = Math.max(0, accounts[a].balance)
        // 유출된 금액만큼 자산에서 세금도 함께 빠진다
        let remainingTax = res.tax
        for (const a of ACCOUNT_TYPES) {
          if (remainingTax <= 0) break
          const take = Math.min(remainingTax, accounts[a].balance)
          accounts[a].balance -= take
          remainingTax -= take
        }
      }
    }
    totalTaxPaid += eventTax

    // ── 연간 납입액 배분 ────────────────────────────────────────
    resetAnnualLimits(limits)
    const freed = input.debt.investFreedPayment ? (debt.freedAnnual[yearIndex] ?? 0) : 0
    const annualContribution =
      monthlyContribution * 12 + (plan.reinvestTaxCredit ? pendingTaxCredit : 0) + freed
    pendingTaxCredit = 0

    const { allocation, deducted } = allocateYear(annualContribution, plan, rules, limits)

    // ── 월별 루프 ──────────────────────────────────────────────
    const monthlyAlloc = emptyAllocation()
    for (const a of ACCOUNT_TYPES) monthlyAlloc[a] = allocation[a] / 12

    let dividendThisYear = 0
    let taxThisYear = eventTax

    const stepCount = options.annualApprox ? 1 : 12
    const stepPrice = options.annualApprox ? Math.pow(1 + monthlyPrice, 12) - 1 : monthlyPrice
    const stepFee = options.annualApprox ? Math.pow(feeFactor, 12) : feeFactor
    const stepDiv = options.annualApprox ? monthlyDiv * 12 : monthlyDiv
    const stepContribScale = options.annualApprox ? 12 : 1

    for (let m = 0; m < stepCount; m++) {
      for (const a of ACCOUNT_TYPES) {
        const state = accounts[a]
        const contribution = monthlyAlloc[a] * stepContribScale

        // 1. 납입 (월초)
        if (returns.contributionTiming === 'begin' && contribution > 0) {
          state.balance += contribution
          state.costBasis += contribution
          state.totalContributed += contribution
        }

        if (state.balance > 0) {
          // 2. 배당 발생
          const dividend = state.balance * stepDiv
          // 3. 원천징수 (일반계좌만)
          const divTax = taxOnDividend(dividend, a, rules)
          const netDividend = dividend - divTax

          dividendThisYear += dividend
          taxThisYear += divTax
          state.taxPaidCumulative += divTax

          // 4. 재투자 또는 현금 유출
          if (returns.reinvestDividends) {
            state.balance += netDividend
            state.costBasis += netDividend
          } else {
            totalDividendCashOut += netDividend
          }

          // 5. 가격 상승 → 6. 보수 차감
          state.balance = state.balance * (1 + stepPrice) * stepFee
        }

        // 1'. 납입 (월말)
        if (returns.contributionTiming === 'end' && contribution > 0) {
          state.balance += contribution
          state.costBasis += contribution
          state.totalContributed += contribution
        }
      }
    }

    totalPrincipal += annualContribution
    totalTaxPaid += taxThisYear - eventTax

    // ── 연말: 세액공제 환급금 계산 ───────────────────────────────
    const credit = taxCreditForYear(deducted, basic.salaryBracket, rules)
    totalTaxCredit += credit
    pendingTaxCredit = credit

    // 연금계좌 원금 구분 (세액공제 대상 / 비대상)
    for (const a of ACCOUNT_TYPES) {
      if (a !== 'pensionSavings' && a !== 'irp') continue
      accounts[a].deductedPrincipal += deducted[a]
      accounts[a].nonDeductedPrincipal += Math.max(0, allocation[a] - deducted[a])
    }

    // ── 스냅샷 ────────────────────────────────────────────────
    const balanceNominal = totalBalance(accounts)
    const byAccount = {} as Record<AccountType, number>
    for (const a of ACCOUNT_TYPES) byAccount[a] = accounts[a].balance

    snapshots.push({
      age: age + 1,
      yearIndex,
      contribution: annualContribution,
      dividend: dividendThisYear,
      taxPaid: taxThisYear,
      taxCredit: credit,
      balance: money(balanceNominal, inflation, yearIndex + 1),
      cumulativePrincipal: totalPrincipal,
      cumulativeGain: balanceNominal - totalPrincipal,
      byAccount,
    })

    // 다음 연도 납입액 증액 (투자 개시 후 12개월마다)
    monthlyContribution *= 1 + plan.contributionGrowthRate
  }

  const finalNominal = totalBalance(accounts)
  const milestones: Milestone[] = []
  for (const y of MILESTONE_YEARS) {
    if (y > years) continue
    const snap = snapshots[y - 1]
    if (snap) milestones.push({ yearsFromNow: y, age: snap.age, balance: snap.balance })
  }
  // 은퇴 시점이 이미 주요 시점 목록에 있으면 중복 추가하지 않는다
  if (years > 0 && !MILESTONE_YEARS.some((y) => y === years)) {
    milestones.push({
      yearsFromNow: years,
      age: basic.retirementAge,
      balance: money(finalNominal, inflation, years),
    })
  }

  return {
    snapshots,
    finalBalance: money(finalNominal, inflation, years),
    totalPrincipal,
    totalGain: finalNominal - totalPrincipal,
    totalTaxPaid,
    totalTaxCredit,
    totalDividendCashOut,
    finalAccounts: accounts,
    milestones,
    debt,
  }
}

/** 축적기 결과에서 인출기 시작 상태를 만든다 (제자리 변형 방지) */
export function accountsFromAccumulation(result: AccumulationResult): Record<AccountType, AccountState> {
  const out = {} as Record<AccountType, AccountState>
  for (const a of ACCOUNT_TYPES) out[a] = { ...result.finalAccounts[a] }
  return out
}

/** 일회성 이벤트 배분 결과 타입 재노출 (테스트 편의) */
export type { Allocation }
