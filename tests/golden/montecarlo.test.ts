/**
 * 골든 테스트 G-15, G-16 (design/07-test-plan.md §2)
 * Monte Carlo 재현성과 기대값 수렴 — ADR-5 위반(Math.random)을 잡아내는 테스트.
 */

import { describe, expect, it } from 'vitest'
import { accountsFromAccumulation, accumulate } from '@/calc/accumulate'
import { lognormalAnnualReturn, runMonteCarlo } from '@/calc/montecarlo'
import { normalizeReturns } from '@/calc/rates'
import { withdraw } from '@/calc/withdraw'
import { mulberry32 } from '@/lib/prng'
import { RULES, makeInput } from '../helpers'

const baseInput = makeInput({
  basic: { currentAge: 45, retirementAge: 60, endAge: 85 },
  returns: { inflation: 0.02, ter: 0 },
  retirement: { healthInsurance: { mode: 'none' }, nationalPension: { monthlyAmountToday: 0 } },
  options: { monteCarlo: { trials: 200, seed: 42, model: 'lognormal', annualApprox: true } },
})

describe('G-15. Monte Carlo 재현성', () => {
  it('같은 시드로 두 번 실행하면 결과가 완전히 동일하다', () => {
    const a = runMonteCarlo(baseInput, RULES)
    const b = runMonteCarlo(baseInput, RULES)

    expect(a.successRate).toBe(b.successRate)
    expect(a.medianFinalBalance).toBe(b.medianFinalBalance)
    expect(a.percentilePaths.p50).toEqual(b.percentilePaths.p50)
    expect(a.sorr.worstSequenceSuccessRate).toBe(b.sorr.worstSequenceSuccessRate)
  })

  it('다른 시드는 다른 결과를 낸다', () => {
    const a = runMonteCarlo(baseInput, RULES)
    const b = runMonteCarlo(
      { ...baseInput, options: { ...baseInput.options, monteCarlo: { ...baseInput.options.monteCarlo, seed: 7 } } },
      RULES,
    )
    expect(a.medianFinalBalance).not.toBe(b.medianFinalBalance)
  })
})

describe('G-16. Monte Carlo 기대값 수렴 (mu 보정 검증)', () => {
  const nearZeroVol = makeInput({
    ...baseInput,
    returns: { ...baseInput.returns, volatility: 0.0001 },
    options: { ...baseInput.options, monteCarlo: { trials: 100, seed: 42, model: 'lognormal', annualApprox: true } },
  })

  it('변동성이 0에 가까우면 중위 최종자산이 결정론적 계산과 일치한다', () => {
    const mc = runMonteCarlo(nearZeroVol, RULES)

    const normalized = normalizeReturns(nearZeroVol.returns)
    const acc = accumulate(nearZeroVol, normalized, RULES, { annualApprox: true })
    const wd = withdraw(accountsFromAccumulation(acc), nearZeroVol, RULES)
    const deterministic = wd.rows[wd.rows.length - 1]?.endingBalance.nominal ?? 0

    const relativeError = Math.abs(mc.medianFinalBalance - deterministic) / Math.max(1, deterministic)
    expect(relativeError).toBeLessThan(0.01)
  })

  it('로그정규 분포의 중위값이 입력 수익률과 일치한다', () => {
    // mu = ln(1+r) 이므로 z=0 일 때 수익률 = r
    const prng = mulberry32(1)
    const samples: number[] = []
    for (let i = 0; i < 20_000; i++) samples.push(lognormalAnnualReturn(0.07, 0.15, prng))
    samples.sort((a, b) => a - b)
    const median = samples[Math.floor(samples.length / 2)] as number
    expect(median).toBeCloseTo(0.07, 2)
  })

  it('산술평균은 중위값보다 높다 — 변동성 있는 자산의 실제 특성', () => {
    const prng = mulberry32(2)
    const samples: number[] = []
    for (let i = 0; i < 20_000; i++) samples.push(lognormalAnnualReturn(0.07, 0.15, prng))
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length
    expect(mean).toBeGreaterThan(0.07)
  })
})

describe('Monte Carlo 결과 구조', () => {
  const result = runMonteCarlo(baseInput, RULES)

  it('성공확률은 0~1 범위다', () => {
    expect(result.successRate).toBeGreaterThanOrEqual(0)
    expect(result.successRate).toBeLessThanOrEqual(1)
  })

  it('백분위 경로가 단조 정렬되어 있다 (p10 ≤ p50 ≤ p90)', () => {
    for (let i = 0; i < result.percentilePaths.p50.length; i++) {
      const p10 = result.percentilePaths.p10[i] as number
      const p50 = result.percentilePaths.p50[i] as number
      const p90 = result.percentilePaths.p90[i] as number
      expect(p10).toBeLessThanOrEqual(p50 + 1e-6)
      expect(p50).toBeLessThanOrEqual(p90 + 1e-6)
    }
  })

  it('경로가 현재 나이 다음 해부터 종료 나이까지 연속으로 이어진다', () => {
    // 축적기 스냅샷(46~60세) + 인출기(61~85세) — 은퇴 나이 중복 없음
    expect(result.pathAges[0]).toBe(46)
    expect(result.pathAges[result.pathAges.length - 1]).toBe(85)
    expect(result.pathAges.length).toBe(85 - 46 + 1)
    expect(result.percentilePaths.p50.length).toBe(result.pathAges.length)

    // 나이가 1살씩 증가하며 중복이 없다
    for (let i = 1; i < result.pathAges.length; i++) {
      expect((result.pathAges[i] as number) - (result.pathAges[i - 1] as number)).toBe(1)
    }
  })

  it('SORR: 은퇴 초기 하위 10% 경로의 성공확률이 전체보다 낮거나 같다', () => {
    expect(result.sorr.worstSequenceSuccessRate).toBeLessThanOrEqual(result.successRate + 1e-9)
  })

  it('모든 결과값이 유한하다', () => {
    expect(Number.isFinite(result.medianFinalBalance)).toBe(true)
    expect(Number.isFinite(result.medianFirstYearNetReal)).toBe(true)
    for (const v of result.percentilePaths.p50) expect(Number.isFinite(v)).toBe(true)
  })

  it('진행률 콜백이 호출된다', () => {
    let lastCompleted = 0
    runMonteCarlo(
      { ...baseInput, options: { ...baseInput.options, monteCarlo: { ...baseInput.options.monteCarlo, trials: 100 } } },
      RULES,
      { onProgress: (completed) => { lastCompleted = completed }, progressIntervalTrials: 25 },
    )
    expect(lastCompleted).toBe(100)
  })

  it('취소하면 중단된다', () => {
    let calls = 0
    const result = runMonteCarlo(baseInput, RULES, {
      isCancelled: () => {
        calls += 1
        return calls > 10
      },
    })
    expect(result.trials).toBeLessThan(baseInput.options.monteCarlo.trials)
  })
})
