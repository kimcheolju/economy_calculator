/**
 * 부채 상환 시뮬레이션 (design/02-calculation-engine.md §12)
 *
 * 빚을 무시하면 계산기는 **결과를 실제보다 좋게** 보여준다. 이 프로젝트에서
 * 가장 피해야 할 방향이라 별도 모듈로 정확히 다룬다.
 *
 * CLAUDE.md R-4: 순수 함수. 현재 날짜를 모른다.
 */

import type { DebtPlan } from './types'

/** 상환이 끝나지 않아도 무한 루프에 빠지지 않게 하는 상한 */
const MAX_MONTHS = 100 * 12

/**
 * 1원 미만 잔액은 상환 완료로 본다.
 *
 * 임계를 1e-6 처럼 두면 정확한 PMT 로 360회를 갚아도 부동소수점 잔여물
 * (실측 0.0000085원)이 남아 상환이 한 달 밀린다. 빚은 원 단위로 존재하므로
 * 임계도 금액 단위여야 한다.
 */
const PAID_OFF = 1

export interface DebtResult {
  /** 은퇴 시점에 남아 있는 원금 (명목) */
  readonly balanceAtRetirement: number
  /** 상환을 마치는 나이. 계산 범위 안에서 못 갚으면 null */
  readonly payoffAge: number | null
  /** 축적기 동안 낸 이자 합계 */
  readonly interestPaidDuringAccumulation: number
  /** 축적기 동안 낸 원리금 합계 */
  readonly totalPaidDuringAccumulation: number
  /**
   * 월 상환액이 월 이자보다 작아 원금이 줄지 않는 상태.
   * 이 경우 잔액은 오히려 늘어난다 — 사용자에게 반드시 알려야 한다.
   */
  readonly neverPaysOff: boolean
  /**
   * 축적기 연도별로 "상환이 끝나 굳은" 금액.
   * 상환 완료 후 그 돈을 투자에 보탠다는 가정을 켰을 때 납입액에 가산된다.
   */
  readonly freedAnnual: readonly number[]
}

export function emptyDebtResult(accumulationYears: number): DebtResult {
  return {
    balanceAtRetirement: 0,
    payoffAge: null,
    interestPaidDuringAccumulation: 0,
    totalPaidDuringAccumulation: 0,
    neverPaysOff: false,
    freedAnnual: new Array<number>(Math.max(0, accumulationYears)).fill(0),
  }
}

/**
 * 원리금균등상환을 월 단위로 시뮬레이션한다.
 *
 * **월이율 = 연이율 / 12 를 쓴다.** CLAUDE.md R-6 이 금지하는 `annual/12` 는
 * *수익률* 변환에 대한 규약이고, 대출 상환은 규약이 다르다 — 한국 은행의
 * 원리금균등상환은 명목 연이율을 12로 나눈 월이율에 월복리를 적용한다.
 * 기하 변환을 쓰면 사용자가 은행에서 받은 상환 스케줄과 어긋나 상환 완료
 * 시점이 밀린다. (design/02-calculation-engine.md §12)
 *
 * 계산 순서 (매월): 이자 발생 → 상환 → 잔액 갱신
 */
export function simulateDebt(
  plan: DebtPlan,
  currentAge: number,
  retirementAge: number,
  endAge: number,
): DebtResult {
  const accumulationYears = Math.max(0, retirementAge - currentAge)
  const principal = Math.max(0, plan.principal)

  if (principal <= 0) return emptyDebtResult(accumulationYears)

  const monthlyRate = Math.max(0, plan.annualRate) / 12
  const payment = Math.max(0, plan.monthlyPayment)

  // 첫 달 이자조차 못 갚으면 원금은 영원히 줄지 않는다
  const neverPaysOff = payment <= principal * monthlyRate + 1e-9

  const freedAnnual = new Array<number>(accumulationYears).fill(0)
  const horizonMonths = Math.min(MAX_MONTHS, Math.max(0, endAge - currentAge) * 12)

  let balance = principal
  let interestPaid = 0
  let totalPaid = 0
  let payoffMonth: number | null = null
  let balanceAtRetirement = 0

  for (let month = 0; month < horizonMonths; month++) {
    const yearIndex = Math.floor(month / 12)
    const inAccumulation = yearIndex < accumulationYears

    if (balance <= PAID_OFF) {
      // 이미 다 갚았다 — 이 달의 상환액이 굳는다
      if (inAccumulation) freedAnnual[yearIndex] = (freedAnnual[yearIndex] ?? 0) + payment
    } else {
      const interest = balance * monthlyRate
      // 마지막 달에는 남은 원리금만 낸다 (초과 납입 방지)
      const due = Math.min(payment, balance + interest)
      balance = balance + interest - due

      if (inAccumulation) {
        interestPaid += interest
        totalPaid += due
      }
      if (balance <= PAID_OFF) {
        balance = 0
        payoffMonth = month
      }
    }

    // 은퇴 시점(축적기 마지막 달의 다음) 잔액을 기록한다
    if (month === accumulationYears * 12 - 1) balanceAtRetirement = balance
  }

  // 축적기가 0년이면 위 루프에서 기록되지 않는다
  if (accumulationYears === 0) balanceAtRetirement = principal

  return {
    balanceAtRetirement,
    // 연말 기준으로 보고한다 — YearSnapshot.age 와 같은 규약이라야 화면에서 어긋나지 않는다.
    // 35세에 시작해 정확히 30년이 걸리면 "65세에 상환 완료"로 읽힌다.
    payoffAge: payoffMonth === null ? null : currentAge + Math.floor(payoffMonth / 12) + 1,
    interestPaidDuringAccumulation: interestPaid,
    totalPaidDuringAccumulation: totalPaid,
    neverPaysOff,
    freedAnnual,
  }
}

/**
 * 대출을 서둘러 갚는 것과 투자하는 것 중 어느 쪽이 유리한가.
 *
 * 대출 상환은 **세금 없는 확정 수익**이므로 세후 기대수익률과 비교해야 공정하다.
 * 여기서는 판단을 내리지 않고 비교에 필요한 두 수치만 돌려준다 — 어느 쪽을
 * 택할지는 사용자의 몫이다 (CLAUDE.md §8: 단정적 조언 금지).
 */
export function compareDebtVsInvest(
  annualRate: number,
  netNominalReturn: number,
): { debtRate: number; investReturn: number; debtIsBetter: boolean } {
  return {
    debtRate: annualRate,
    investReturn: netNominalReturn,
    debtIsBetter: annualRate > netNominalReturn,
  }
}
