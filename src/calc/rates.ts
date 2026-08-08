/**
 * 수익률·물가 환산 유틸 (design/02-calculation-engine.md §1)
 *
 * 이 파일의 규약은 CLAUDE.md R-6으로 고정되어 있다. 임의로 바꾸지 말 것.
 */

import type { NormalizedReturns, ReturnAssumptions } from './types'

/** 수익률 하한 — (1+r)^(1/12) 이 NaN 이 되는 것을 막는다 */
export const MIN_RETURN = -0.99

/**
 * 연 → 월 수익률 (기하평균).
 * `annual / 12` 는 금지 — 연 7%, 10년 적립식에서 약 +1.2%(207만원) 과대계산된다.
 */
export function monthlyFromAnnual(annual: number): number {
  const safe = Math.max(annual, MIN_RETURN)
  return Math.pow(1 + safe, 1 / 12) - 1
}

/**
 * 월 배당수익률 (단순 안분).
 * 배당은 자산에 대한 '흐름'이므로 기하 변환하지 않는다.
 * 이 선택의 결과로 재투자 시 실현 총수익률이 입력값보다 극미하게 높아진다
 * (d=1.5%일 때 연 약 +0.01%p). 의도된 근사.
 */
export function monthlyDividendYield(annualDividendYield: number): number {
  return annualDividendYield / 12
}

/**
 * TER 월 차감 배율.
 * 보수는 자산에 비례 차감되므로 수익률에서 빼는 것이 아니라 자산에 곱한다.
 * `r - f` 로 처리하면 자산이 클 때 오차가 커진다.
 */
export function monthlyFeeFactor(ter: number): number {
  const safe = Math.min(Math.max(ter, 0), 0.99)
  return Math.pow(1 - safe, 1 / 12)
}

/** 보수 차감 후 명목 수익률 (표시용) */
export function netNominalReturn(totalReturn: number, ter: number): number {
  return (1 + totalReturn) * (1 - ter) - 1
}

/** 실질 수익률 — Fisher 정확식. `nominal - inflation` 은 금지. */
export function realReturn(nominal: number, inflation: number): number {
  return (1 + nominal) / (1 + inflation) - 1
}

/** 명목 → 실질 (오늘 구매력 기준) */
export function toReal(nominalAmount: number, inflation: number, yearsFromNow: number): number {
  return nominalAmount / Math.pow(1 + inflation, yearsFromNow)
}

/** 실질 → 명목 (미래 시점 금액) */
export function toNominal(realAmount: number, inflation: number, yearsFromNow: number): number {
  return realAmount * Math.pow(1 + inflation, yearsFromNow)
}

/** 명목 금액에 실질 환산을 붙여 Money 를 만든다 */
export function money(nominal: number, inflation: number, yearsFromNow: number) {
  return { nominal, real: toReal(nominal, inflation, yearsFromNow) } as const
}

/**
 * 두 입력 모드를 동일한 내부 표현으로 수렴시킨다 (design/01-features.md §3).
 *
 * 원안의 "Total Return 입력 시 배당수익률을 중복 가산하지 마라"를 구현하는 지점.
 * 어느 모드든 totalReturn = priceReturn + dividendYield 항등식이 성립한다.
 */
export function normalizeReturns(r: Pick<ReturnAssumptions, 'mode' | 'totalReturn' | 'priceReturn' | 'dividendYield'>): NormalizedReturns {
  const dividendYield = Math.max(0, r.dividendYield)

  if (r.mode === 'totalReturn') {
    const totalReturn = r.totalReturn
    // 배당을 다시 더하지 않는다 — 총수익률에서 배당분을 분리할 뿐이다.
    return { totalReturn, dividendYield, priceReturn: totalReturn - dividendYield }
  }

  const priceReturn = r.priceReturn
  return { priceReturn, dividendYield, totalReturn: priceReturn + dividendYield }
}

/**
 * 실질 연금현가 계수 (annuity-due, 연초 인출).
 * PV = R × (1 − (1+rr)^−n) / rr × (1+rr),  rr ≈ 0 이면 PV = R × n
 */
export function annuityDuePresentValueFactor(rate: number, years: number): number {
  if (years <= 0) return 0
  if (Math.abs(rate) < 1e-9) return years
  return ((1 - Math.pow(1 + rate, -years)) / rate) * (1 + rate)
}

/**
 * annuity-due 연금 상환액 계수 — 현가 1원을 n년에 걸쳐 소진하는 연 인출액.
 * PMT = A / PVfactor
 */
export function annuityDuePaymentFactor(rate: number, years: number): number {
  const pv = annuityDuePresentValueFactor(rate, years)
  return pv <= 0 ? 0 : 1 / pv
}
