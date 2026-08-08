/**
 * 시드 기반 PRNG (ADR-5)
 *
 * Math.random() 을 쓰면 같은 입력에 다른 결과가 나와 버그 재현과 테스트가 불가능해진다.
 * Monte Carlo 는 반드시 이 PRNG 를 인자로 받는다.
 */

export interface Prng {
  /** [0, 1) 균등분포 */
  next(): number
}

/** mulberry32 — 빠르고 통계적 품질이 충분한 32비트 PRNG */
export function mulberry32(seed: number): Prng {
  let a = seed >>> 0
  return {
    next(): number {
      a = (a + 0x6d2b79f5) >>> 0
      let t = a
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
  }
}

/**
 * Box-Muller 변환으로 표준정규분포 표본을 만든다.
 * 두 표본 중 하나만 쓰고 버린다 (구현 단순성 우선 — 병목은 시뮬레이션 루프다).
 */
export function gaussian(prng: Prng): number {
  let u = 0
  let v = 0
  // log(0) 을 피한다
  while (u === 0) u = prng.next()
  while (v === 0) v = prng.next()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}
