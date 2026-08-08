/**
 * 경고 판정 (design/01-features.md §5.10)
 *
 * 정직함이 정확함보다 우선한다. 계산기가 다루지 못하는 지점은 경고로 알린다.
 */

import type { TaxRuleSet } from '@/data/tax/types'
import { realReturn } from './rates'
import {
  ACCOUNT_LABELS,
  type AccumulationResult,
  type CalculatorInput,
  type FireResult,
  type NormalizedReturns,
  type Warning,
  type WithdrawalResult,
} from './types'

const manwon = (v: number) => `${Math.round(v / 10_000).toLocaleString('ko-KR')}만원`

export function buildWarnings(
  input: CalculatorInput,
  normalized: NormalizedReturns,
  rules: TaxRuleSet,
  accumulation: AccumulationResult,
  withdrawal: WithdrawalResult,
  fire: FireResult,
): Warning[] {
  const out: Warning[] = []
  const { basic, returns, retirement } = input

  // ── 비현실적 가정 ──────────────────────────────────────────
  if (normalized.totalReturn > 0.12) {
    out.push({
      code: 'HIGH_RETURN',
      severity: 'warn',
      message: `기대수익률 ${(normalized.totalReturn * 100).toFixed(1)}%는 역사적 장기 평균을 크게 상회하는 가정입니다.`,
      relatedField: 'returns.totalReturn',
    })
  }
  const realExpected = realReturn(normalized.totalReturn, returns.inflation)
  if (realExpected > 0.08) {
    out.push({
      code: 'HIGH_REAL_RETURN',
      severity: 'warn',
      message: `실질 기대수익률이 ${(realExpected * 100).toFixed(1)}%로 매우 높습니다.`,
      relatedField: 'returns.totalReturn',
    })
  }
  if (returns.retirementReturn > normalized.totalReturn) {
    out.push({
      code: 'RETIREMENT_RETURN_HIGHER',
      severity: 'info',
      message: '은퇴 후 기대수익률이 축적기보다 높게 설정되어 있습니다. 일반적으로 은퇴 후에는 자산배분이 보수화됩니다.',
      relatedField: 'returns.retirementReturn',
    })
  }

  // ── 금융소득종합과세 ───────────────────────────────────────
  const threshold = rules.comprehensiveIncomeThreshold.value.amount
  const lastSnapshot = accumulation.snapshots[accumulation.snapshots.length - 1]
  const taxableDividend = lastSnapshot
    ? lastSnapshot.dividend * (lastSnapshot.byAccount.taxable / Math.max(1, lastSnapshot.balance.nominal))
    : 0
  if (taxableDividend > threshold) {
    out.push({
      code: 'COMPREHENSIVE_TAX_THRESHOLD',
      severity: 'warn',
      message: `축적기 말 일반계좌 배당이 연 ${manwon(taxableDividend)}으로 금융소득종합과세 기준(${manwon(threshold)})을 초과합니다. 실제 세부담이 계산보다 커질 수 있습니다.`,
    })
  }

  const maxWithdrawalFinancialIncome = withdrawal.rows.reduce(
    (max, r) => Math.max(max, r.withdrawalByAccount.taxable),
    0,
  )
  if (maxWithdrawalFinancialIncome > threshold * 3) {
    out.push({
      code: 'WITHDRAWAL_COMPREHENSIVE_TAX',
      severity: 'info',
      message: '은퇴 후 일반계좌 인출 규모가 커서 금융소득종합과세 대상이 될 수 있습니다. 인출 순서 조정을 검토하세요.',
    })
  }

  // ── 사적연금 분리과세 한도 ──────────────────────────────────
  const pensionThreshold = rules.pensionAccount.separateTaxThreshold.value.amount
  const maxPrivatePension = withdrawal.rows.reduce(
    (max, r) => Math.max(max, r.withdrawalByAccount.pensionSavings + r.withdrawalByAccount.irp),
    0,
  )
  if (maxPrivatePension > pensionThreshold) {
    out.push({
      code: 'PRIVATE_PENSION_THRESHOLD',
      severity: 'warn',
      message: `사적연금 연 인출액이 최대 ${manwon(maxPrivatePension)}으로 분리과세 한도(${manwon(pensionThreshold)})를 초과합니다. 종합과세 또는 16.5% 분리과세를 선택해야 하며, 본 계산은 16.5%로 처리했습니다.`,
    })
  }

  // ── 계좌 한도 / 오버플로 ───────────────────────────────────
  const firstSnapshot = accumulation.snapshots[0]
  if (firstSnapshot && firstSnapshot.byAccount.taxable > 0 && input.accounts.allocationMode === 'auto') {
    const priorityHasTaxable = input.accounts.allocationPriority.includes('taxable')
    if (!priorityHasTaxable) {
      out.push({
        code: 'ALLOCATION_OVERFLOW',
        severity: 'info',
        message: '세제 혜택 계좌의 납입한도를 초과한 금액은 일반계좌로 배분되었습니다.',
      })
    }
  }

  // ── ISA 의무가입기간 ───────────────────────────────────────
  const holdingYears = basic.retirementAge - basic.currentAge
  const minHolding = rules.isa.minHoldingYears.value.years
  if (accumulation.finalAccounts.isa.balance > 0 && holdingYears < minHolding) {
    out.push({
      code: 'ISA_HOLDING_PERIOD',
      severity: 'warn',
      message: `은퇴까지 ${holdingYears}년으로 ISA 의무가입기간 ${minHolding}년을 충족하지 못합니다. 비과세 혜택이 상실된 것으로 계산했습니다.`,
    })
  }

  // ── 브리지 기간 ───────────────────────────────────────────
  const minPensionAge = rules.pensionAccount.minAge.value.age
  if (basic.retirementAge < minPensionAge) {
    const bridgeYears = minPensionAge - basic.retirementAge
    out.push({
      code: 'BRIDGE_PERIOD',
      severity: 'warn',
      message: `${basic.retirementAge}세 은퇴 시 ${minPensionAge}세까지 ${bridgeYears}년간 연금저축·IRP를 인출할 수 없습니다. 이 구간의 재원은 일반계좌와 ISA뿐입니다.`,
    })
  }
  if (retirement.nationalPension.monthlyAmountToday > 0 && retirement.nationalPension.startAge > basic.retirementAge) {
    const gap = retirement.nationalPension.startAge - basic.retirementAge
    out.push({
      code: 'PENSION_GAP',
      severity: 'info',
      message: `은퇴(${basic.retirementAge}세)부터 국민연금 개시(${retirement.nationalPension.startAge}세)까지 ${gap}년간은 투자자산만으로 생활해야 합니다.`,
    })
  }

  // ── 인출 부족 / 고갈 ───────────────────────────────────────
  // 계획 소진형·VPW는 종료 나이에 잔액 0이 되는 것이 설계 의도이므로 경고하지 않는다.
  if (withdrawal.depletionAge !== null && withdrawal.depletionAge < basic.endAge) {
    out.push({
      code: 'ASSET_DEPLETION',
      severity: 'warn',
      message: `${withdrawal.depletionAge}세에 투자자산이 고갈됩니다. (계획 종료 나이: ${basic.endAge}세)`,
    })
  } else if (withdrawal.depletionAge === basic.endAge && (retirement.strategy === 'fixedReal' || retirement.strategy === 'fixedPercent')) {
    out.push({
      code: 'ASSET_DEPLETION_AT_END',
      severity: 'info',
      message: `계획 종료 나이(${basic.endAge}세)에 자산이 모두 소진됩니다.`,
    })
  }
  const shortfallRow = withdrawal.rows.find((r) => r.shortfall > 1)
  if (shortfallRow) {
    out.push({
      code: 'WITHDRAWAL_SHORTFALL',
      severity: 'warn',
      message: `${shortfallRow.age}세부터 계획한 인출액을 자산으로 충당할 수 없습니다.`,
    })
  }

  // ── 목표 달성 ─────────────────────────────────────────────
  if (fire.achievementBySpend < 1) {
    const pct = (fire.achievementBySpend * 100).toFixed(1)
    out.push({
      code: 'TARGET_NOT_MET',
      severity: 'info',
      message: `목표 월 생활비의 ${pct}%를 충족합니다. 필요 월 납입액은 역산 도구로 확인할 수 있습니다.`,
    })
  }

  // ── 배당 미재투자 ─────────────────────────────────────────
  if (!returns.reinvestDividends && accumulation.totalDividendCashOut > 0) {
    out.push({
      code: 'DIVIDEND_NOT_REINVESTED',
      severity: 'info',
      message: `배당 재투자를 끄셨습니다. 누적 ${manwon(accumulation.totalDividendCashOut)}의 배당이 자산에 반영되지 않았습니다.`,
    })
  }

  // ── 개정안 적용 ───────────────────────────────────────────
  if (input.options.applyProposedRules) {
    out.push({
      code: 'PROPOSED_RULES_APPLIED',
      severity: 'info',
      message: '국회 통과 전 개정안(2026 세제개편안)이 적용된 계산입니다. 확정된 제도가 아닙니다.',
    })
  }

  // ── DC·퇴직금 계좌 안내 ────────────────────────────────────
  if (input.accounts.initialBalances.dcRetirement > 0) {
    out.push({
      code: 'DC_RETIREMENT_APPROX',
      severity: 'info',
      message: `${ACCOUNT_LABELS.dcRetirement} 인출 시 퇴직소득세는 사용자가 입력한 실효세율 ${(input.accounts.retirementIncomeTaxRate * 100).toFixed(1)}%로 근사했습니다.`,
    })
  }

  return out
}
