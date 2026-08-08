/**
 * 경제적 자유 필요자산 계산 (design/02-calculation-engine.md §6)
 *
 * 원안 2번. 한 가지 숫자만 제시하지 않고 인출률 3종 + 사용자 지정 + 계획 소진형을 비교한다.
 *
 * 검토판 §2.2: 인출액에는 세금과 건보료가 붙으므로, 세후 필요액을 그대로 인출률로
 * 나누면 필요자산이 과소 계산된다. 세전 필요액을 이분법으로 역산한다(gross-up).
 */

import type { TaxRuleSet } from '@/data/tax/types'
import { bisectExpanding } from '@/lib/bisect'
import { annuityDuePresentValueFactor, money, realReturn, toNominal, toReal } from './rates'
import { annualHealthInsurance } from './tax/insurance'
import { cloneAccounts, createYearTaxState, drawFromAccounts, emptyAccountState, totalBalance } from './draw'
import { annualSpendAtRetirement, monthlySpendAtAge } from './spending'
import { pensionAdjustmentFactor, pensionIncomeAt } from './pension'
import { settleAtRetirement } from './withdraw'
import {
  ACCOUNT_TYPES,
  type AccountState,
  type AccountType,
  type CalculatorInput,
  type FireComparisonRow,
  type FireResult,
} from './types'

const COMPARISON_RATES = [0.03, 0.035, 0.04] as const

export interface Composition {
  /** 계좌별 자산 비중 */
  share: Record<AccountType, number>
  /** 계좌별 평가이익 비율 */
  gainRatio: Record<AccountType, number>
  /** 연금계좌의 세액공제 원금 비율 */
  deductedRatio: Record<AccountType, number>
}

/**
 * 투영된 포트폴리오의 구성비를 추출한다.
 * 필요자산 역산은 이 구성비를 가진 가상 포트폴리오로 세율을 계산한다.
 * 자산이 0이면 전액 일반계좌·평가이익 0으로 근사한다(가정 패널에 고지).
 */
export function extractComposition(accounts: Record<AccountType, AccountState>): Composition {
  const total = totalBalance(accounts)
  const share = {} as Record<AccountType, number>
  const gainRatio = {} as Record<AccountType, number>
  const deductedRatio = {} as Record<AccountType, number>

  for (const a of ACCOUNT_TYPES) {
    const st = accounts[a]
    share[a] = total > 0 ? st.balance / total : a === 'taxable' ? 1 : 0
    gainRatio[a] = st.balance > 0 ? Math.max(0, Math.min(1, (st.balance - st.costBasis) / st.balance)) : 0
    deductedRatio[a] = st.balance > 0 ? Math.max(0, Math.min(1, st.deductedPrincipal / st.balance)) : 0
  }

  return { share, gainRatio, deductedRatio }
}

/** 구성비를 유지한 채 총액이 `total` 인 가상 포트폴리오를 만든다 */
function virtualPortfolio(total: number, comp: Composition): Record<AccountType, AccountState> {
  const out = {} as Record<AccountType, AccountState>
  for (const a of ACCOUNT_TYPES) {
    const balance = total * comp.share[a]
    out[a] = {
      ...emptyAccountState(),
      balance,
      costBasis: balance * (1 - comp.gainRatio[a]),
      deductedPrincipal: balance * comp.deductedRatio[a],
      nonDeductedPrincipal: balance * (1 - comp.gainRatio[a] - comp.deductedRatio[a]),
      totalContributed: balance * (1 - comp.gainRatio[a]),
    }
  }
  return out
}

export interface GrossUpContext {
  input: CalculatorInput
  rules: TaxRuleSet
  composition: Composition
  /** 세율 계산에 사용할 가상 포트폴리오 총액 */
  referenceTotal: number
  /** 건보료 소득 인정에 쓰이는 공적연금 연액 */
  publicPensionAnnual: number
  age: number
}

/** 세전 인출액 `gross` 로부터 세후 실수령액을 계산한다 */
export function netFromGross(gross: number, ctx: GrossUpContext): number {
  if (gross <= 0) return 0
  const { input, rules } = ctx
  const total = Math.max(ctx.referenceTotal, gross * 1.0001)
  const accounts = virtualPortfolio(total, ctx.composition)
  const yearTax = createYearTaxState(input.accounts.etfKind, rules)

  const draw = drawFromAccounts(gross, accounts, input.retirement.withdrawalPriority, {
    age: ctx.age,
    etfKind: input.accounts.etfKind,
    rules,
    pensionYearIndex: Math.max(1, ctx.age - Math.max(rules.pensionAccount.minAge.value.age, input.basic.retirementAge) + 1),
    retirementIncomeTaxRate: input.accounts.retirementIncomeTaxRate,
  }, yearTax)

  const insuranceWith = annualHealthInsurance(
    {
      mode: input.retirement.healthInsurance.mode,
      fixedMonthlyAmount: input.retirement.healthInsurance.fixedMonthlyAmount,
      publicPensionIncome: ctx.publicPensionAnnual,
      financialIncome: draw.realizedFinancialIncome,
    },
    rules,
  )
  const insurancePensionOnly = annualHealthInsurance(
    {
      mode: input.retirement.healthInsurance.mode,
      fixedMonthlyAmount: input.retirement.healthInsurance.fixedMonthlyAmount,
      publicPensionIncome: ctx.publicPensionAnnual,
      financialIncome: 0,
    },
    rules,
  )
  // 연금소득에 귀속되는 건보료는 연금 순액에서 이미 차감되므로 한계 증가분만 반영한다
  const marginalInsurance = Math.max(0, insuranceWith - insurancePensionOnly)

  return draw.totalWithdrawn - draw.tax - marginalInsurance
}

/** 세후 필요액으로부터 세전 인출액을 역산한다 */
export function solveGross(netNeeded: number, ctx: GrossUpContext): number {
  if (netNeeded <= 0) return 0
  const root = bisectExpanding((g) => netFromGross(g, ctx) - netNeeded, {
    lo: netNeeded,
    hi: netNeeded * 2.5,
    tol: 1000,
    maxIter: 60,
    maxHi: netNeeded * 100,
  })
  // 역산 실패 시 세금이 없다고 보고 원액을 반환한다 (과소 추정임을 경고로 표시)
  return root ?? netNeeded
}

/**
 * 경제적 자유 필요자산 계산.
 *
 * @param projectedAccounts 축적기 결과의 계좌 상태 (구성비·세율 산정에 사용)
 * @param projectedAssetsNominal 은퇴 시점 예상 총자산 (명목) — 달성 여부 판정용
 * @param actualMonthlyNetReal 인출 시뮬레이션의 실제 월 실수령액 (실질) — 달성률 계산용
 */
export function calcFire(
  input: CalculatorInput,
  rules: TaxRuleSet,
  projectedAccounts: Record<AccountType, AccountState>,
  actualMonthlyNetReal: number,
): FireResult {
  const { basic, returns, retirement } = input
  const inflation = returns.inflation
  const Y = basic.retirementAge - basic.currentAge
  const n = Math.max(1, basic.endAge - basic.retirementAge + 1)

  // ISA 정산 후 구성비를 사용한다 (은퇴 시점의 실제 계좌 구성)
  const settled = settleAtRetirement(cloneAccounts(projectedAccounts), input, rules)
  const projectedAssetsNominal = totalBalance(settled.accounts)
  const composition = extractComposition(settled.accounts)

  const annualSpend = annualSpendAtRetirement(
    retirement.targetMonthlySpendToday,
    inflation,
    basic.currentAge,
    basic.retirementAge,
  )

  const adjustment = pensionAdjustmentFactor(retirement.nationalPension, basic.birthYear, rules)
  const pension = pensionIncomeAt(
    basic.retirementAge,
    retirement.nationalPension,
    retirement.otherPension,
    basic.currentAge,
    inflation,
    adjustment,
  )
  const pensionInsurance = annualHealthInsurance(
    {
      mode: retirement.healthInsurance.mode,
      fixedMonthlyAmount: retirement.healthInsurance.fixedMonthlyAmount,
      publicPensionIncome: pension.nationalAnnual,
      financialIncome: 0,
    },
    rules,
  )
  const annualPensionNet = Math.max(0, pension.grossAnnual - pension.tax - pensionInsurance)

  const netNeededFromAssets = Math.max(0, annualSpend - annualPensionNet)

  // 세율 계산용 기준 포트폴리오 총액: 실제 예상자산을 쓰되, 0이면 필요액 규모로 근사
  const referenceTotal =
    projectedAssetsNominal > 0
      ? projectedAssetsNominal
      : netNeededFromAssets / Math.max(0.005, retirement.withdrawalRate)

  const ctx: GrossUpContext = {
    input,
    rules,
    composition,
    referenceTotal,
    publicPensionAnnual: pension.nationalAnnual,
    age: basic.retirementAge,
  }

  const grossNeeded = solveGross(netNeededFromAssets, ctx)
  const monthlyNetFromAssets = netNeededFromAssets / 12
  const monthlyNetTotal = (netNeededFromAssets + annualPensionNet) / 12

  const rates: { rate: number; label: string }[] = COMPARISON_RATES.map((r) => ({
    rate: r,
    label: `연 ${(r * 100).toFixed(1)}% 인출`,
  }))
  const userRate = retirement.withdrawalRate
  if (!COMPARISON_RATES.some((r) => Math.abs(r - userRate) < 1e-9)) {
    rates.push({ rate: userRate, label: `연 ${(userRate * 100).toFixed(2)}% 인출 (지정)` })
  }
  rates.sort((a, b) => a.rate - b.rate)

  const comparison: FireComparisonRow[] = rates.map(({ rate, label }) => {
    const requiredNominal = rate > 0 ? grossNeeded / rate : Number.POSITIVE_INFINITY
    return buildRow({
      method: label,
      rate,
      requiredNominal,
      grossMonthly: (requiredNominal * rate) / 12,
      monthlyNetFromAssets,
      monthlyNetTotal,
      projectedAssetsNominal,
      inflation,
      Y,
    })
  })

  // 계획 소진형: 실질 기준 연금현가
  const rr = realReturn(returns.retirementReturn, inflation)
  const grossNeededReal = toReal(grossNeeded, inflation, Y)
  const pvReal = grossNeededReal * annuityDuePresentValueFactor(rr, n)
  const depletionRequiredNominal = toNominal(pvReal, inflation, Y)

  comparison.push(
    buildRow({
      method: `계획 소진형 (~${basic.endAge}세)`,
      rate: null,
      requiredNominal: depletionRequiredNominal,
      grossMonthly: grossNeeded / 12,
      monthlyNetFromAssets,
      monthlyNetTotal,
      projectedAssetsNominal,
      inflation,
      Y,
    }),
  )

  const targetMonthlyNominal = monthlySpendAtAge(
    retirement.targetMonthlySpendToday,
    inflation,
    basic.currentAge,
    basic.retirementAge,
  )

  const userRow = comparison.find((r) => r.rate !== null && Math.abs(r.rate - userRate) < 1e-9)
  const requiredForUserRate = userRow?.requiredAssets.nominal ?? grossNeeded / Math.max(1e-9, userRate)

  return {
    targetMonthlySpend: money(targetMonthlyNominal, inflation, Y),
    annualPensionNetAtRetirement: annualPensionNet,
    grossNeededAtRetirement: grossNeeded,
    comparison,
    // 주 지표: 실질 월 실수령액 ÷ 목표 월 실질 생활비 (검토판 §2.16)
    achievementBySpend:
      retirement.targetMonthlySpendToday > 0
        ? actualMonthlyNetReal / retirement.targetMonthlySpendToday
        : 1,
    achievementByAsset:
      requiredForUserRate > 0 ? projectedAssetsNominal / requiredForUserRate : 1,
  }
}

function buildRow(args: {
  method: string
  rate: number | null
  requiredNominal: number
  grossMonthly: number
  monthlyNetFromAssets: number
  monthlyNetTotal: number
  projectedAssetsNominal: number
  inflation: number
  Y: number
}): FireComparisonRow {
  const { method, rate, requiredNominal, grossMonthly, monthlyNetTotal, projectedAssetsNominal, inflation, Y } = args
  const achievable = projectedAssetsNominal >= requiredNominal
  return {
    method,
    rate,
    requiredAssets: money(requiredNominal, inflation, Y),
    monthlyWithdrawGross: grossMonthly,
    monthlyNet: money(monthlyNetTotal, inflation, Y),
    isAchievable: achievable,
    shortfall: Math.max(0, requiredNominal - projectedAssetsNominal),
  }
}
