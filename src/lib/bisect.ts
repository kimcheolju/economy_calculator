/**
 * 이분법 근 찾기 (design/02-calculation-engine.md §8)
 *
 * 뉴턴법은 발산 위험이 있어 사용하지 않는다.
 * 해를 찾지 못하면 null 을 반환하고, UI가 "계산 불가"로 처리한다.
 */

export interface BisectOptions {
  lo: number
  hi: number
  /** x 축 허용 오차 */
  tol: number
  maxIter?: number
}

/** f(x) = 0 의 근. f 가 [lo, hi]에서 부호를 바꾸지 않으면 null */
export function bisect(f: (x: number) => number, opts: BisectOptions): number | null {
  const { lo, hi, tol, maxIter = 80 } = opts
  let a = lo
  let b = hi
  let fa = f(a)
  let fb = f(b)

  if (!Number.isFinite(fa) || !Number.isFinite(fb)) return null
  if (fa === 0) return a
  if (fb === 0) return b
  if (fa > 0 === fb > 0) return null

  for (let i = 0; i < maxIter; i++) {
    const mid = (a + b) / 2
    const fmid = f(mid)
    if (!Number.isFinite(fmid)) return null
    if (Math.abs(fmid) === 0 || b - a < tol) return mid
    if (fa > 0 === fmid > 0) {
      a = mid
      fa = fmid
    } else {
      b = mid
      fb = fmid
    }
  }

  return (a + b) / 2
}

/**
 * 상한을 자동으로 확장하며 근을 찾는다.
 * f(lo) < 0 이고 f(hi) 가 아직 음수면 hi 를 배로 늘린다.
 */
export function bisectExpanding(
  f: (x: number) => number,
  opts: BisectOptions & { maxHi?: number },
): number | null {
  const maxHi = opts.maxHi ?? opts.hi * 1024
  let hi = opts.hi
  const flo = f(opts.lo)
  if (!Number.isFinite(flo)) return null
  if (flo >= 0) return opts.lo

  while (hi <= maxHi) {
    const fhi = f(hi)
    if (Number.isFinite(fhi) && fhi >= 0) {
      return bisect(f, { ...opts, hi })
    }
    hi *= 2
  }
  return null
}
