/**
 * Monte Carlo + 서열수익률 위험(SORR) 분석 (design/02-calculation-engine.md §10)
 *
 * 원안 129행: "은퇴 후에는 투자 초기에 큰 하락장이 발생하는 Sequence of Returns Risk가
 * 매우 중요하므로, 향후 이를 반영할 수 있도록 계산 구조를 설계해주세요."
 *
 * ADR-4가 이 요구의 실체다: accumulate()/withdraw() 가 연도별 수익률 배열을 주입받으므로
 * 결정론적 계산은 상수 배열을 주입한 특수 케이스가 된다.
 *
 * ADR-5: 시드 PRNG 필수. Math.random() 을 쓰면 같은 입력에 다른 결과가 나온다.
 */

import type { TaxRuleSet } from '@/data/tax/types'
import { gaussian, mulberry32, type Prng } from '@/lib/prng'
import { accountsFromAccumulation, accumulate } from './accumulate'
import { normalizeReturns } from './rates'
import { withdraw } from './withdraw'
import type { CalculatorInput, MonteCarloResult } from './types'

export interface MonteCarloOptions {
  onProgress?: (completed: number, total: number) => void
  /** 취소 확인 콜백 — true 를 반환하면 중단한다 */
  isCancelled?: () => boolean
  progressIntervalTrials?: number
}

/**
 * 로그정규 연 수익률 생성.
 *
 * mu = ln(1 + r) 로 두면 분포의 **중위값·기하평균**이 입력 수익률과 일치한다.
 * 사용자가 입력하는 "예상 연평균 수익률"은 CAGR(기하평균)이므로 이것이 올바른 보정이다.
 * (산술평균은 exp(mu + σ²/2) − 1 로 입력값보다 높아지며, 이는 현실의 자산군 특성과 일치한다.)
 *
 * mu 보정을 빼먹으면 기대 기하수익률이 입력값보다 낮아진다 — 흔한 버그.
 */
export function lognormalAnnualReturn(mean: number, sigma: number, prng: Prng): number {
  const mu = Math.log(1 + Math.max(mean, -0.99))
  const z = gaussian(prng)
  return Math.exp(mu + sigma * z) - 1
}

function percentileOf(sorted: Float64Array | number[], p: number): number {
  const n = sorted.length
  if (n === 0) return 0
  const idx = Math.min(n - 1, Math.max(0, Math.round((p / 100) * (n - 1))))
  return sorted[idx] as number
}

function medianOf(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return percentileOf(sorted, 50)
}

export function runMonteCarlo(
  input: CalculatorInput,
  rules: TaxRuleSet,
  options: MonteCarloOptions = {},
): MonteCarloResult {
  const normalized = normalizeReturns(input.returns)
  const { basic, returns, options: simOptions } = input
  const trials = Math.max(1, Math.floor(simOptions.monteCarlo.trials))
  const sigma = Math.max(0, returns.volatility)

  const accumulationYears = Math.max(0, basic.retirementAge - basic.currentAge)
  const withdrawalYears = Math.max(1, basic.endAge - basic.retirementAge + 1)
  /** 수익률을 생성해야 하는 연수 (축적기 + 인출기 전체) */
  const totalYears = accumulationYears + withdrawalYears

  /**
   * 경로 지점의 나이 매핑.
   * 축적기 스냅샷의 나이는 '연말 기준'(currentAge+1 … retirementAge)이고,
   * 인출기 첫 행의 나이는 은퇴 나이와 겹치므로 AssetGrowthChart 와 같은 규약으로 중복을 제거한다.
   */
  const pathAges: number[] = []
  for (let y = 0; y < accumulationYears; y++) pathAges.push(basic.currentAge + 1 + y)
  for (let y = 1; y < withdrawalYears; y++) pathAges.push(basic.retirementAge + y)
  const pathPoints = pathAges.length

  const prng = mulberry32(simOptions.monteCarlo.seed)

  // 경로 저장은 한 덩어리로 할당한다 (객체 생성 최소화 — design §10.5)
  const paths = new Float64Array(trials * pathPoints)
  const finalBalances: number[] = []
  const firstYearNetReal: number[] = []
  const depletionAges: (number | null)[] = []
  /** 은퇴 직후 10년 누적수익률 (SORR 분석용) */
  const earlyRetirementReturns: number[] = []

  const returnsBuffer = new Array<number>(totalYears)
  const progressInterval = options.progressIntervalTrials ?? 250

  let completed = 0

  for (let trial = 0; trial < trials; trial++) {
    if (options.isCancelled?.()) break

    // 축적기와 인출기의 기대수익률이 다르다 (은퇴 후 자산배분 보수화)
    for (let y = 0; y < accumulationYears; y++) {
      returnsBuffer[y] = lognormalAnnualReturn(normalized.totalReturn, sigma, prng)
    }
    for (let y = accumulationYears; y < totalYears; y++) {
      returnsBuffer[y] = lognormalAnnualReturn(returns.retirementReturn, sigma, prng)
    }

    const accumulationPath = returnsBuffer.slice(0, accumulationYears)
    const withdrawalPath = returnsBuffer.slice(accumulationYears)

    const acc = accumulate(input, normalized, rules, {
      returnsOverride: accumulationPath,
      annualApprox: simOptions.monteCarlo.annualApprox,
    })
    const wd = withdraw(accountsFromAccumulation(acc), input, rules, {
      returnsOverride: withdrawalPath,
    })

    const base = trial * pathPoints
    for (let y = 0; y < accumulationYears; y++) {
      paths[base + y] = acc.snapshots[y]?.balance.nominal ?? 0
    }
    // 인출기 첫 행(은퇴 나이)은 축적기 마지막 스냅샷과 나이가 겹치므로 건너뛴다
    for (let y = 1; y < withdrawalYears; y++) {
      paths[base + accumulationYears + y - 1] = wd.rows[y]?.endingBalance.nominal ?? 0
    }

    const lastRow = wd.rows[wd.rows.length - 1]
    finalBalances.push(lastRow?.endingBalance.nominal ?? 0)
    firstYearNetReal.push(wd.firstYearMonthlyNet.real)
    depletionAges.push(wd.depletionAge)

    // 은퇴 초기 10년(또는 인출기 전체) 누적 수익률
    let cumulative = 1
    const window = Math.min(10, withdrawalYears)
    for (let y = 0; y < window; y++) cumulative *= 1 + (withdrawalPath[y] ?? 0)
    earlyRetirementReturns.push(cumulative)

    completed = trial + 1
    if (options.onProgress && (completed % progressInterval === 0 || completed === trials)) {
      options.onProgress(completed, trials)
    }
  }

  const effectiveTrials = Math.max(1, completed)

  // ── 백분위 경로 ────────────────────────────────────────────
  const p10: number[] = []
  const p25: number[] = []
  const p50: number[] = []
  const p75: number[] = []
  const p90: number[] = []
  const column = new Float64Array(effectiveTrials)

  for (let y = 0; y < pathPoints; y++) {
    for (let t = 0; t < effectiveTrials; t++) column[t] = paths[t * pathPoints + y] as number
    const sorted = column.slice().sort()
    p10.push(percentileOf(sorted, 10))
    p25.push(percentileOf(sorted, 25))
    p50.push(percentileOf(sorted, 50))
    p75.push(percentileOf(sorted, 75))
    p90.push(percentileOf(sorted, 90))
  }

  // ── 성공확률 및 고갈 분포 ───────────────────────────────────
  const successes = depletionAges.slice(0, effectiveTrials).filter((a) => a === null).length
  const depleted = depletionAges.slice(0, effectiveTrials).filter((a): a is number => a !== null)

  const histMap = new Map<number, number>()
  for (const age of depleted) histMap.set(age, (histMap.get(age) ?? 0) + 1)
  const depletionAgeHistogram = [...histMap.entries()]
    .map(([age, count]) => ({ age, count }))
    .sort((a, b) => a.age - b.age)

  // ── SORR: 은퇴 초기 수익률 하위 10% 경로 ─────────────────────
  const indices = Array.from({ length: effectiveTrials }, (_, i) => i)
  indices.sort((a, b) => (earlyRetirementReturns[a] as number) - (earlyRetirementReturns[b] as number))
  const worstCount = Math.max(1, Math.floor(effectiveTrials * 0.1))
  const worstIndices = indices.slice(0, worstCount)

  const worstSuccesses = worstIndices.filter((i) => depletionAges[i] === null).length
  const worstDepleted = worstIndices
    .map((i) => depletionAges[i])
    .filter((a): a is number => a !== null && a !== undefined)

  return {
    trials: effectiveTrials,
    successRate: successes / effectiveTrials,
    percentilePaths: { p10, p25, p50, p75, p90 },
    pathAges,
    depletionAgeHistogram,
    medianFinalBalance: medianOf(finalBalances.slice(0, effectiveTrials)) ?? 0,
    medianFirstYearNetReal: medianOf(firstYearNetReal.slice(0, effectiveTrials)) ?? 0,
    sorr: {
      worstSequenceSuccessRate: worstSuccesses / worstCount,
      worstSequenceMedianDepletionAge: medianOf(worstDepleted),
      overallMedianDepletionAge: medianOf(depleted),
      note: `은퇴 직후 ${Math.min(10, withdrawalYears)}년 누적수익률이 하위 10%인 ${worstCount}개 경로의 결과입니다. 같은 평균 수익률이라도 은퇴 초기에 하락장이 오면 결과가 크게 악화됩니다.`,
    },
  }
}
