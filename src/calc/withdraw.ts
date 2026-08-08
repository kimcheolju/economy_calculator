/**
 * 은퇴 후 인출 시뮬레이션 (design/02-calculation-engine.md §7)
 *
 * 검토판 §2.1: 인출 전략 4종을 명시적으로 구분한다.
 * 검토판 §2.4: 은퇴 시점과 연금 수령 시점 사이의 '브리지 기간'을 구간으로 나눈다.
 *
 * 세금은 연 단위로 과세되므로 연 단위 루프로 계산하고 월 표시액은 연액 ÷ 12 로 제시한다.
 * 인출을 연초에 하고 남은 잔액이 1년간 성장하는 것으로 모델링한다 (보수적).
 */

import type { TaxRuleSet } from '@/data/tax/types'
import { annuityDuePaymentFactor, money, realReturn, toNominal, toReal } from './rates'
import { annualHealthInsurance } from './tax/insurance'
import { settleIsa } from './tax/withdrawal'
import {
  cloneAccounts,
  createYearTaxState,
  drawFromAccounts,
  isAccessible,
  totalBalance,
} from './draw'
import { monthlySpendAtAge } from './spending'
import { pensionAdjustmentFactor, pensionIncomeAt } from './pension'
import {
  ACCOUNT_TYPES,
  type AccountState,
  type AccountType,
  type CalculatorInput,
  type PhaseSummary,
  type WithdrawalResult,
  type WithdrawalStrategy,
  type YearlyWithdrawalRow,
} from './types'

export interface WithdrawOptions {
  /** 연도별 명목 수익률 배열. 인덱스 0 = 은퇴 첫 해 (Monte Carlo용, ADR-4) */
  returnsOverride?: readonly number[]
}

export interface SettlementResult {
  readonly accounts: Record<AccountType, AccountState>
  readonly isaTax: number
  readonly isaHoldingMet: boolean
}

/**
 * 은퇴 시점 ISA 정산 (design/03 §4.2).
 * 순이익에서 비과세 한도를 차감하고 초과분에 9.9% 분리과세한 뒤 일반계좌로 이관한다.
 */
export function settleAtRetirement(
  accounts: Record<AccountType, AccountState>,
  input: CalculatorInput,
  rules: TaxRuleSet,
): SettlementResult {
  const next = cloneAccounts(accounts)
  const isa = next.isa
  if (isa.balance <= 0) return { accounts: next, isaTax: 0, isaHoldingMet: true }

  const holdingYears = input.basic.retirementAge - input.basic.currentAge
  const settlement = settleIsa(isa, input.basic.isaType, holdingYears, rules)

  // 정산 후 일반계좌로 이관. 취득원가를 전액 원금화하므로 이후 성장분만 과세된다.
  next.taxable.balance += settlement.netBalance
  next.taxable.costBasis += settlement.netBalance
  next.taxable.totalContributed += settlement.netBalance
  next.taxable.taxPaidCumulative += settlement.tax

  next.isa = { ...isa, balance: 0, costBasis: 0, totalContributed: 0 }

  return { accounts: next, isaTax: settlement.tax, isaHoldingMet: settlement.holdingRequirementMet }
}

/** 전략별 연 인출액 (명목) */
export function strategyAmount(
  strategy: WithdrawalStrategy,
  args: {
    age: number
    currentAge: number
    retirementAge: number
    endAge: number
    inflation: number
    withdrawalRate: number
    retirementRealReturn: number
    /** 은퇴 시점 총자산 (명목) */
    assetsAtRetirementNominal: number
    /** 현재 잔여자산 (명목) */
    currentBalance: number
  },
): number {
  const {
    age,
    currentAge,
    retirementAge,
    endAge,
    inflation,
    withdrawalRate,
    retirementRealReturn,
    assetsAtRetirementNominal,
    currentBalance,
  } = args

  switch (strategy) {
    case 'fixedReal': {
      // 첫해 = 자산 × 인출률, 이후 매년 물가상승률만큼 증액 (Bengen 원전)
      const base = assetsAtRetirementNominal * withdrawalRate
      return toNominal(base, inflation, age - retirementAge)
    }
    case 'fixedPercent':
      // 매년 그 해 잔여자산 × 인출률 → 절대 고갈되지 않는다
      return currentBalance * withdrawalRate

    case 'depletion': {
      // 은퇴 시점에 1회 산정하고 이후 물가연동 → 종료 나이에 잔액 0
      const n = Math.max(1, endAge - retirementAge + 1)
      const factor = annuityDuePaymentFactor(retirementRealReturn, n)
      const realAmountToday = toReal(assetsAtRetirementNominal, inflation, retirementAge - currentAge) * factor
      return toNominal(realAmountToday, inflation, age - currentAge)
    }
    case 'vpw': {
      // 매년 잔여자산·잔여기간으로 재산정
      const remainingYears = Math.max(1, endAge - age + 1)
      return currentBalance * annuityDuePaymentFactor(retirementRealReturn, remainingYears)
    }
  }
}

interface PhaseDef {
  name: string
  fromAge: number
  toAge: number
  note?: string
}

/** 연령 구간 분할 (design §7.6) */
export function buildPhases(input: CalculatorInput, rules: TaxRuleSet): PhaseDef[] {
  const { retirementAge, endAge } = input.basic
  const minAge = rules.pensionAccount.minAge.value.age

  // 연금소득이 없으면 '연금 수령기'라는 이름이 사실과 다르므로 중립적인 이름을 쓴다
  const hasPensionIncome =
    input.retirement.nationalPension.monthlyAmountToday > 0 ||
    input.retirement.otherPension.monthlyAmountToday > 0

  const pensionStart = hasPensionIncome
    ? Math.max(
        retirementAge,
        Math.min(
          input.retirement.nationalPension.monthlyAmountToday > 0
            ? input.retirement.nationalPension.startAge
            : Number.POSITIVE_INFINITY,
          input.retirement.otherPension.monthlyAmountToday > 0
            ? input.retirement.otherPension.startAge
            : Number.POSITIVE_INFINITY,
        ),
      )
    : retirementAge

  const defs: PhaseDef[] = [
    {
      name: '브리지 1',
      fromAge: retirementAge,
      toAge: Math.min(minAge - 1, endAge),
      note: `${minAge}세 전에는 연금저축·IRP를 인출할 수 없습니다. 이 구간의 재원은 일반계좌와 ISA뿐입니다.`,
    },
    { name: '브리지 2', fromAge: Math.max(retirementAge, minAge), toAge: Math.min(pensionStart - 1, endAge) },
    {
      name: hasPensionIncome ? '연금 수령기' : '자산 인출기',
      fromAge: Math.max(retirementAge, pensionStart),
      toAge: endAge,
      note: hasPensionIncome
        ? undefined
        : '연금소득 입력이 없어 전 구간을 투자자산 인출만으로 계산했습니다. 국민연금 예상 수령액을 입력하면 결과가 크게 달라집니다.',
    },
  ]

  return defs.filter((d) => d.fromAge <= d.toAge)
}

function phaseNameForAge(phases: PhaseDef[], age: number): string {
  for (const p of phases) {
    if (age >= p.fromAge && age <= p.toAge) return p.name
  }
  return '기타'
}

/**
 * 인출기 시뮬레이션.
 *
 * 반환하는 `firstYearMonthlyNet.real` 이 이 제품의 핵심 지표(Hero Metric)다:
 * "은퇴 후 오늘 구매력 기준으로 매달 쓸 수 있는 세후 금액".
 */
export function withdraw(
  accountsAtRetirement: Record<AccountType, AccountState>,
  input: CalculatorInput,
  rules: TaxRuleSet,
  options: WithdrawOptions = {},
): WithdrawalResult {
  const { basic, returns, retirement, accounts: plan } = input
  const inflation = returns.inflation
  const yearsToRetirement = basic.retirementAge - basic.currentAge

  const settled = settleAtRetirement(accountsAtRetirement, input, rules)
  const accounts = settled.accounts

  const assetsAtRetirementNominal = totalBalance(accounts)
  const retirementRealReturn = realReturn(returns.retirementReturn, inflation)
  const minAge = rules.pensionAccount.minAge.value.age
  const phases = buildPhases(input, rules)
  const adjustment = pensionAdjustmentFactor(retirement.nationalPension, basic.birthYear, rules)

  const rows: YearlyWithdrawalRow[] = []
  let totalTaxPaid = 0
  let totalInsurancePaid = 0
  let depletionAge: number | null = null

  for (let age = basic.retirementAge; age <= basic.endAge; age++) {
    const yearOffset = age - basic.retirementAge
    const yearsFromNow = age - basic.currentAge
    const balanceBefore = totalBalance(accounts)

    const pensionYearIndex = age >= minAge ? age - Math.max(minAge, basic.retirementAge) + 1 : 1

    const targetSpendNominal = monthlySpendAtAge(
      retirement.targetMonthlySpendToday,
      inflation,
      basic.currentAge,
      age,
    ) * 12

    const pension = pensionIncomeAt(
      age,
      retirement.nationalPension,
      retirement.otherPension,
      basic.currentAge,
      inflation,
      adjustment,
    )

    const gross = Math.max(
      0,
      strategyAmount(retirement.strategy, {
        age,
        currentAge: basic.currentAge,
        retirementAge: basic.retirementAge,
        endAge: basic.endAge,
        inflation,
        withdrawalRate: retirement.withdrawalRate,
        retirementRealReturn,
        assetsAtRetirementNominal,
        currentBalance: balanceBefore,
      }),
    )

    const yearTax = createYearTaxState(plan.etfKind, rules)
    const draw = drawFromAccounts(gross, accounts, retirement.withdrawalPriority, {
      age,
      etfKind: plan.etfKind,
      rules,
      pensionYearIndex,
      retirementIncomeTaxRate: plan.retirementIncomeTaxRate,
    }, yearTax)

    const insurance = annualHealthInsurance(
      {
        mode: retirement.healthInsurance.mode,
        fixedMonthlyAmount: retirement.healthInsurance.fixedMonthlyAmount,
        publicPensionIncome: pension.nationalAnnual,
        financialIncome: draw.realizedFinancialIncome,
      },
      rules,
    )

    const incomeTax = draw.tax + pension.tax
    const netIncomeNominal = Math.max(
      0,
      draw.totalWithdrawn + pension.grossAnnual - incomeTax - insurance,
    )

    totalTaxPaid += incomeTax
    totalInsurancePaid += insurance

    // 연말 성장 (인출 후 잔액이 1년간 성장)
    const yearReturn = options.returnsOverride?.[yearOffset] ?? returns.retirementReturn
    for (const a of ACCOUNT_TYPES) {
      if (accounts[a].balance > 0) accounts[a].balance *= 1 + yearReturn
    }

    const endingBalance = totalBalance(accounts)
    const withdrawalByAccount = { ...draw.withdrawnByAccount }

    rows.push({
      age,
      phase: phaseNameForAge(phases, age),
      targetSpend: money(targetSpendNominal, inflation, yearsFromNow),
      grossWithdrawal: draw.totalWithdrawn,
      withdrawalByAccount,
      pensionIncome: pension.grossAnnual,
      incomeTax,
      healthInsurance: insurance,
      netIncome: money(netIncomeNominal, inflation, yearsFromNow),
      endingBalance: money(endingBalance, inflation, yearsFromNow),
      shortfall: draw.shortfall,
    })

    if (depletionAge === null && endingBalance <= 1 && balanceBefore > 0) {
      depletionAge = age
    }
  }

  const first = rows[0]

  const phaseSummaries: PhaseSummary[] = phases.map((p) => {
    const phaseRows = rows.filter((r) => r.age >= p.fromAge && r.age <= p.toAge)
    const count = Math.max(1, phaseRows.length)
    const sumNet = phaseRows.reduce((s, r) => s + r.netIncome.nominal, 0)
    const sumNetReal = phaseRows.reduce((s, r) => s + r.netIncome.real, 0)
    const sumPension = phaseRows.reduce((s, r) => s + r.pensionIncome, 0)
    const sumWithdrawal = phaseRows.reduce((s, r) => s + r.grossWithdrawal, 0)
    const last = phaseRows[phaseRows.length - 1]
    const sources = ACCOUNT_TYPES.filter((a) => isAccessible(a, p.fromAge, rules))

    return {
      name: p.name,
      fromAge: p.fromAge,
      toAge: p.toAge,
      availableSources: sources,
      avgMonthlyNet: { nominal: sumNet / count / 12, real: sumNetReal / count / 12 },
      avgMonthlyPension: sumPension / count / 12,
      avgMonthlyWithdrawal: sumWithdrawal / count / 12,
      endingBalance: last?.endingBalance ?? money(0, inflation, 0),
      note: p.note,
    }
  })

  return {
    rows,
    phases: phaseSummaries,
    firstYearMonthlyGross: (first?.grossWithdrawal ?? 0) / 12,
    firstYearMonthlyNet: first
      ? { nominal: first.netIncome.nominal / 12, real: first.netIncome.real / 12 }
      : money(0, inflation, yearsToRetirement),
    depletionAge,
    totalTaxPaid,
    totalInsurancePaid,
    isaSettlementTax: settled.isaTax,
  }
}
