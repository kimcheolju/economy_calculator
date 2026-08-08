/**
 * 기본값 (design/04-data-model.md §4)
 *
 * 기본값은 보수적으로 설정한다. 낙관적 기본값은 사용자를 오도한다.
 */

import type { CalculatorInput } from '@/calc/types'
import { DEFAULT_RULE_SET_ID } from '@/data/tax'

export const DEFAULT_INPUT: CalculatorInput = {
  schemaVersion: 1,
  basic: {
    currentAge: 35,
    retirementAge: 55,
    endAge: 95, // 장수 리스크 대비
    salaryBracket: 'over55m',
    isaType: 'general',
  },
  returns: {
    mode: 'totalReturn',
    totalReturn: 0.07, // 글로벌 주식 장기 명목수익률의 보수적 하단
    priceReturn: 0.055,
    dividendYield: 0.015, // 글로벌 주식 배당수익률 근사
    inflation: 0.02, // 한국은행 물가안정목표
    ter: 0.0015, // 국내 상장 대표 지수 ETF 수준
    retirementReturn: 0.04, // 채권 비중 상승 반영
    reinvestDividends: true,
    contributionTiming: 'begin',
    volatility: 0.15, // 글로벌 주식 연 표준편차 근사
  },
  accounts: {
    monthlyContribution: 1_000_000,
    contributionGrowthRate: 0.03,
    initialBalances: { taxable: 0, isa: 0, pensionSavings: 0, irp: 0, dcRetirement: 0 },
    allocationMode: 'auto',
    // 세제 혜택이 큰 순서. 연금계좌는 1차 패스에서 세액공제 한도까지만 채워지고,
    // ISA 다음에 추가 납입이 이어진다 (design/02 §2.1).
    allocationPriority: ['pensionSavings', 'irp', 'isa', 'taxable'],
    etfKind: 'domesticListedForeign',
    reinvestTaxCredit: true,
    retirementIncomeTaxRate: 0.05,
  },
  retirement: {
    targetMonthlySpendToday: 3_000_000,
    strategy: 'fixedReal',
    withdrawalRate: 0.035, // 4% 룰의 한국 적용 한계를 반영한 보수적 값
    // 과세이연 혜택이 큰 계좌를 최대한 늦게 소진한다
    withdrawalPriority: ['taxable', 'isa', 'pensionSavings', 'irp', 'dcRetirement'],
    nationalPension: {
      monthlyAmountToday: 0,
      startAge: 65,
      isCompanyEstimate: true,
      inflationIndexed: true,
      effectiveTaxRate: 0.03,
    },
    otherPension: {
      monthlyAmountToday: 0,
      startAge: 60,
      inflationIndexed: false, // 사적연금은 보통 비연동
    },
    healthInsurance: { mode: 'rateApprox' },
  },
  events: [],
  options: {
    taxRuleSetId: DEFAULT_RULE_SET_ID,
    applyProposedRules: false,
    scenarioOffsets: { returnOffset: 0.02, inflationOffset: 0.005 },
    monteCarlo: { trials: 10_000, seed: 42, model: 'lognormal', annualApprox: true },
  },
}

/** 기본값 선택 근거 — 가정 패널과 도움말에 노출 */
export const DEFAULT_RATIONALE: Readonly<Record<string, string>> = {
  inflation: '한국은행 물가안정목표 2.0%',
  totalReturn: '글로벌 주식 장기 명목수익률의 보수적 하단. 낙관값을 기본으로 두지 않습니다.',
  dividendYield: '글로벌 주식 배당수익률 근사',
  ter: '국내 상장 대표 지수 ETF 수준',
  retirementReturn: '은퇴 후 채권 비중 상승을 반영한 보수적 가정',
  withdrawalRate: '4% 룰은 미국 데이터·30년 기준이므로 한국 세제·건보료·기대수명을 고려해 3.5%를 기본값으로 둡니다.',
  endAge: '장수 리스크 대비',
  volatility: '글로벌 주식 연 표준편차 근사 (Monte Carlo 전용)',
  contributionGrowthRate: '임금상승률 반영',
}

/** 금액 입력 프리셋 칩 (월 단위 금액용) */
export const MONEY_PRESETS = [500_000, 1_000_000, 2_000_000, 3_000_000] as const

/** 목돈(현재 자산) 입력 프리셋 칩 — 월 단위 프리셋과 자릿수가 달라 따로 둔다 */
export const SAVINGS_PRESETS = [10_000_000, 50_000_000, 100_000_000, 300_000_000] as const
