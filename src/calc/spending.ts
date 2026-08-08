/**
 * 목표 생활비 환산 (design/02-calculation-engine.md §4)
 *
 * 원안 49행: "현재 원하는 생활비가 월 300만원이라면, 은퇴 시점의 물가를 반영하여
 * 은퇴 당시 실제로 필요한 월생활비도 계산해주세요."
 */

import { toNominal } from './rates'

/** 임의 나이 시점의 명목 월 생활비 (실질 생활수준 유지) */
export function monthlySpendAtAge(
  targetMonthlySpendToday: number,
  inflation: number,
  currentAge: number,
  age: number,
): number {
  return toNominal(targetMonthlySpendToday, inflation, age - currentAge)
}

/** 은퇴 시점의 명목 연 생활비 */
export function annualSpendAtRetirement(
  targetMonthlySpendToday: number,
  inflation: number,
  currentAge: number,
  retirementAge: number,
): number {
  return monthlySpendAtAge(targetMonthlySpendToday, inflation, currentAge, retirementAge) * 12
}
