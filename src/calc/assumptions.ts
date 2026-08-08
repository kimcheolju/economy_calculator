/**
 * 가정 목록 조립 (CLAUDE.md R-8, design/05-ui-ux.md §7)
 *
 * 계산 결과에는 항상 근거가 따라간다. 숫자만 보여주고 근거를 숨기는 화면을 만들지 않는다.
 */

import type { Sourced, TaxRuleSet } from '@/data/tax/types'
import { combinedInsuranceRate } from './tax/insurance'
import { netNominalReturn, realReturn } from './rates'
import { STRATEGY_DEFINITIONS, STRATEGY_LABELS, type Assumption, type CalculatorInput, type NormalizedReturns } from './types'

const pct = (v: number, digits = 2) => `${(v * 100).toFixed(digits)}%`
const won = (v: number) => `${Math.round(v).toLocaleString('ko-KR')}원`

function fromSourced<T>(
  label: string,
  s: Sourced<T>,
  value: string,
  group: Assumption['group'] = '적용 세제',
): Assumption {
  return {
    label,
    value,
    source: s.source,
    asOf: s.asOf,
    status: s.status === 'proposed' ? 'proposed' : s.status,
    group,
  }
}

export function buildAssumptions(
  input: CalculatorInput,
  normalized: NormalizedReturns,
  rules: TaxRuleSet,
): Assumption[] {
  const { returns, basic, retirement, accounts } = input
  const netNominal = netNominalReturn(normalized.totalReturn, returns.ter)
  const realExpected = realReturn(netNominal, returns.inflation)
  const retirementReal = realReturn(returns.retirementReturn, returns.inflation)

  const out: Assumption[] = [
    {
      group: '수익률',
      label: '연평균 총수익률',
      value: pct(normalized.totalReturn),
      derivation:
        returns.mode === 'totalReturn'
          ? '입력값 (배당을 중복 가산하지 않고 가격상승률과 배당수익률로 분해)'
          : '가격상승률 + 배당수익률',
    },
    { group: '수익률', label: '├ 가격상승률', value: pct(normalized.priceReturn) },
    { group: '수익률', label: '└ 배당수익률', value: pct(normalized.dividendYield) },
    { group: '수익률', label: 'ETF 총보수(TER)', value: pct(returns.ter) },
    {
      group: '수익률',
      label: '보수 차감 후 명목수익률',
      value: pct(netNominal),
      derivation: `(1 + ${pct(normalized.totalReturn)}) × (1 − ${pct(returns.ter)}) − 1`,
    },
    fromSourced('물가상승률', rules.inflation.bokTarget, pct(returns.inflation), '수익률'),
    {
      group: '수익률',
      label: '실질 기대수익률',
      value: pct(realExpected),
      derivation: `(1 + ${pct(netNominal)}) ÷ (1 + ${pct(returns.inflation)}) − 1  (Fisher 정확식)`,
    },
    { group: '수익률', label: '은퇴 후 명목수익률', value: pct(returns.retirementReturn) },
    {
      group: '수익률',
      label: '은퇴 후 실질수익률',
      value: pct(retirementReal),
      derivation: `(1 + ${pct(returns.retirementReturn)}) ÷ (1 + ${pct(returns.inflation)}) − 1`,
    },
    { group: '수익률', label: '안전인출률', value: pct(retirement.withdrawalRate) },

    // ── 계산 규약 ──────────────────────────────────────────────
    {
      group: '계산 규약',
      label: '납입 시점',
      value: returns.contributionTiming === 'begin' ? '월초 (annuity-due)' : '월말 (annuity-immediate)',
    },
    {
      group: '계산 규약',
      label: '연 → 월 수익률 변환',
      value: '기하평균 (1+r)^(1/12) − 1',
      derivation: '단순 r/12 는 사용하지 않습니다 (연 7%·10년에서 약 +1.2% 과대계산)',
    },
    { group: '계산 규약', label: 'ETF 보수 차감', value: '자산 비례 — 월 배율에 (1−TER)^(1/12) 곱' },
    { group: '계산 규약', label: '배당 처리', value: returns.reinvestDividends ? '세후 재투자' : '현금 인출 (자산에 미반영)' },
    { group: '계산 규약', label: '납입금 증액', value: `연 ${pct(accounts.contributionGrowthRate)} (12개월마다 1회)` },
    { group: '계산 규약', label: '인출 시점', value: '연초 인출, 잔액이 1년간 성장 (보수적)' },
    {
      group: '계산 규약',
      label: '인출 전략',
      value: STRATEGY_LABELS[retirement.strategy],
      derivation: STRATEGY_DEFINITIONS[retirement.strategy],
    },
    { group: '계산 규약', label: '실질금액 기준 시점', value: '오늘(계산 실행일) 구매력' },
    { group: '계산 규약', label: '계좌 배분 우선순위', value: accounts.allocationPriority.join(' → ') },
    { group: '계산 규약', label: '인출 우선순위', value: retirement.withdrawalPriority.join(' → ') },

    // ── 적용 세제 ──────────────────────────────────────────────
    fromSourced('배당소득 원천징수 (일반계좌)', rules.dividendWithholding, pct(rules.dividendWithholding.value.rate, 1)),
    fromSourced(
      'ETF 매매차익 과세',
      rules.etf[accounts.etfKind],
      rules.etf[accounts.etfKind].value.capitalGainsRate === 0
        ? '비과세'
        : `${pct(rules.etf[accounts.etfKind].value.capitalGainsRate, 1)}${
            rules.etf[accounts.etfKind].value.annualDeduction > 0
              ? ` (연 ${won(rules.etf[accounts.etfKind].value.annualDeduction)} 공제)`
              : ' (기본공제 없음)'
          }`,
    ),
    fromSourced('ISA 연 납입한도', rules.isa.annualLimit, won(rules.isa.annualLimit.value.amount)),
    fromSourced(
      'ISA 비과세 한도',
      basic.isaType === 'general' ? rules.isa.exemptGeneral : rules.isa.exemptLowIncome,
      won(basic.isaType === 'general' ? rules.isa.exemptGeneral.value.amount : rules.isa.exemptLowIncome.value.amount),
    ),
    fromSourced('ISA 초과분 분리과세', rules.isa.excessRate, pct(rules.isa.excessRate.value.rate, 1)),
    fromSourced(
      '연금저축+IRP 납입한도',
      rules.pensionAccount.combinedAnnualLimit,
      won(rules.pensionAccount.combinedAnnualLimit.value.amount),
    ),
    fromSourced(
      '연금 세액공제율',
      basic.salaryBracket === 'under55m' ? rules.pensionAccount.creditRateLow : rules.pensionAccount.creditRateHigh,
      pct(
        basic.salaryBracket === 'under55m'
          ? rules.pensionAccount.creditRateLow.value.rate
          : rules.pensionAccount.creditRateHigh.value.rate,
        1,
      ),
    ),
    fromSourced(
      '연금소득세 (55~69세)',
      rules.pensionAccount.withdrawalRates,
      pct(rules.pensionAccount.withdrawalRates.value.under70, 1),
    ),
    fromSourced(
      '사적연금 분리과세 한도',
      rules.pensionAccount.separateTaxThreshold,
      won(rules.pensionAccount.separateTaxThreshold.value.amount),
    ),
    fromSourced(
      '금융소득종합과세 기준',
      rules.comprehensiveIncomeThreshold,
      won(rules.comprehensiveIncomeThreshold.value.amount),
    ),
  ]

  if (retirement.healthInsurance.mode === 'rateApprox') {
    out.push(
      fromSourced(
        '건강보험료 합산 요율',
        rules.healthInsurance.rate,
        `${pct(combinedInsuranceRate(rules), 2)} (건보 ${pct(rules.healthInsurance.rate.value.rate, 2)} × 장기요양 포함)`,
      ),
    )
  } else if (retirement.healthInsurance.mode === 'fixed') {
    out.push({
      group: '적용 세제',
      label: '건강보험료',
      value: `${won((retirement.healthInsurance.fixedMonthlyAmount ?? 0))} / 월 (사용자 입력)`,
      status: 'userOverride',
    })
  } else {
    out.push({ group: '적용 세제', label: '건강보험료', value: '미반영 (피부양자 가정)', status: 'approximation' })
  }

  if (retirement.nationalPension.monthlyAmountToday > 0) {
    out.push(
      fromSourced(
        '국민연금 물가연동',
        rules.nationalPension.inflationIndexed,
        retirement.nationalPension.inflationIndexed ? '적용 (실질가치 유지)' : '미적용 (실질가치 하락)',
      ),
      {
        group: '적용 세제',
        label: '국민연금 실효세율',
        value: pct(retirement.nationalPension.effectiveTaxRate, 1),
        status: 'approximation',
        source: rules.nationalPension.effectiveTaxRate.source,
        asOf: rules.nationalPension.effectiveTaxRate.asOf,
      },
    )
  }

  out.push({
    group: '적용 세제',
    label: '세제 기준일',
    value: `${rules.label} (검토 ${rules.lastReviewed})`,
    source: rules.dividendWithholding.source,
    asOf: rules.lastReviewed,
    status: 'confirmed',
  })

  // ── 한계 ────────────────────────────────────────────────────
  const limits: string[] = [
    '환율 변동은 반영하지 않습니다 (입력한 수익률은 원화 기준으로 가정)',
    '금융소득종합과세는 경고만 표시하며 누진세를 정확히 계산하지 않습니다 (다른 소득을 알 수 없음)',
    '축적기 리밸런싱으로 인한 중도 실현 과세는 반영하지 않습니다',
    '국내상장 해외ETF의 과표기준가를 모사하지 않고 매매차익 전액을 과세표준으로 근사합니다 (보수적)',
    'ISA 미사용 납입한도 이월은 반영하지 않습니다 (보수적)',
    '퇴직소득세는 사용자가 입력한 실효세율로 근사합니다',
    '사적연금이 연 1,500만원을 초과하면 16.5% 분리과세로 보수적으로 계산합니다',
    '필요자산의 세전 역산(gross-up)은 은퇴 첫해의 계좌 구성비와 세율을 기준으로 계산합니다. 이후 계좌가 소진되며 세율이 달라지는 효과는 반영되지 않습니다',
    '세법과 제도는 변경될 수 있습니다',
  ]
  if (retirement.healthInsurance.mode === 'rateApprox') {
    limits.unshift('건강보험료는 소득 기준 근사이며 재산·자동차 부과분은 반영하지 않습니다 (실제보다 과소 추정)')
  }
  for (const text of limits) {
    out.push({ group: '한계', label: '·', value: text, status: 'approximation' })
  }

  return out
}
