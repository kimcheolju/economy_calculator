/**
 * 골든 테스트 G-1 ~ G-6, G-9 (design/07-test-plan.md §2)
 *
 * ⚠ 이 파일의 기대값은 독립 계산(PowerShell)으로 검증된 값이다. 임의로 수정하지 말 것.
 *   테스트가 깨지면 기대값을 고치는 게 아니라 왜 계산이 바뀌었는지 먼저 규명한다.
 */

import { describe, expect, it } from 'vitest'
import { accumulate } from '@/calc/accumulate'
import { normalizeReturns, netNominalReturn, realReturn, toReal } from '@/calc/rates'
import { pureCompoundInput, taxFreeRules } from '../helpers'

const RULES = taxFreeRules()

function runAccumulate(input: ReturnType<typeof pureCompoundInput>) {
  return accumulate(input, normalizeReturns(input.returns), RULES)
}

describe('G-1. 적립식 복리 — 월초 납입 (기하 변환 검증)', () => {
  it('초기 0원, 월 100만원, 연 7%, 10년 → 172,018,882.61원', () => {
    const input = pureCompoundInput()
    const result = runAccumulate(input)
    // 엑셀 대조: =FV(1.07^(1/12)-1, 120, -1000000, 0, 1)
    expect(result.finalBalance.nominal).toBeCloseTo(172_018_882.61, 0)
  })

  it('총 납입원금은 1억 2천만원', () => {
    const result = runAccumulate(pureCompoundInput())
    expect(result.totalPrincipal).toBeCloseTo(120_000_000, 6)
  })

  it('투자수익 = 총자산 − 납입원금', () => {
    const result = runAccumulate(pureCompoundInput())
    expect(result.totalGain).toBeCloseTo(result.finalBalance.nominal - result.totalPrincipal, 6)
  })
})

describe('G-2. 적립식 복리 — 월말 납입', () => {
  it('동일 조건, 월말 납입 → 171,051,731.26원', () => {
    const input = pureCompoundInput({ returns: { contributionTiming: 'end' } })
    expect(runAccumulate(input).finalBalance.nominal).toBeCloseTo(171_051_731.26, 0)
  })

  it('월초/월말 차이는 967,151원 — 원안 32행의 요구가 실제로 결과를 바꾼다', () => {
    const begin = runAccumulate(pureCompoundInput()).finalBalance.nominal
    const end = runAccumulate(
      pureCompoundInput({ returns: { contributionTiming: 'end' } }),
    ).finalBalance.nominal
    expect(begin - end).toBeCloseTo(967_151.35, 0)
    expect(begin).toBeGreaterThan(end)
  })
})

describe('G-3. 단순 나눗셈 변환 금지 (음성 테스트)', () => {
  it('r/12 로 계산한 값(174,094,468.81)과 일치하지 않는다', () => {
    const result = runAccumulate(pureCompoundInput()).finalBalance.nominal
    const naive = 174_094_468.81
    // r/12 를 쓰면 10년에 +1.21%(약 207만원) 과대계산된다
    expect(Math.abs(result - naive)).toBeGreaterThan(2_000_000)
  })
})

describe('G-4. 일시금 복리', () => {
  it('초기 1억원, 추가납입 0, 연 7%, 30년 → 761,225,504.27원', () => {
    const input = pureCompoundInput({
      basic: { currentAge: 35, retirementAge: 65 },
      accounts: { monthlyContribution: 0, initialBalances: { taxable: 100_000_000 } },
    })
    expect(runAccumulate(input).finalBalance.nominal).toBeCloseTo(761_225_504.27, 0)
  })
})

describe('G-5. 물가 환산 (명목 → 실질)', () => {
  it('명목 10억원, 물가 2%, 30년 후 → 552,070,888.98원', () => {
    expect(toReal(1_000_000_000, 0.02, 30)).toBeCloseTo(552_070_888.98, 2)
  })

  it('실질/명목 비율 = 1/1.02^30 = 0.55207089', () => {
    expect(toReal(1, 0.02, 30)).toBeCloseTo(0.55207089, 8)
  })

  it('시뮬레이션 결과의 실질 환산이 일치한다', () => {
    const input = pureCompoundInput({
      basic: { currentAge: 35, retirementAge: 65 },
      accounts: { monthlyContribution: 0, initialBalances: { taxable: 100_000_000 } },
      returns: { inflation: 0.02 },
    })
    const result = runAccumulate(input)
    expect(result.finalBalance.real).toBeCloseTo(result.finalBalance.nominal / Math.pow(1.02, 30), 4)
  })
})

describe('G-6. TER 차감 (자산 비례)', () => {
  it('초기 1억원, 연 7%, 30년, TER 0.5% → 654,946,390.35원', () => {
    const input = pureCompoundInput({
      basic: { currentAge: 35, retirementAge: 65 },
      accounts: { monthlyContribution: 0, initialBalances: { taxable: 100_000_000 } },
      returns: { ter: 0.005 },
    })
    expect(runAccumulate(input).finalBalance.nominal).toBeCloseTo(654_946_390.35, 0)
  })

  it('TER 없는 결과 대비 비율이 정확히 0.995^30 이다', () => {
    const base = pureCompoundInput({
      basic: { currentAge: 35, retirementAge: 65 },
      accounts: { monthlyContribution: 0, initialBalances: { taxable: 100_000_000 } },
    })
    const noTer = runAccumulate(base).finalBalance.nominal
    const withTer = runAccumulate({ ...base, returns: { ...base.returns, ter: 0.005 } }).finalBalance.nominal
    expect(withTer / noTer).toBeCloseTo(Math.pow(0.995, 30), 8)
  })

  it('수익률에서 단순히 빼는 방식(r − f)과 다르다', () => {
    const input = pureCompoundInput({
      basic: { currentAge: 35, retirementAge: 65 },
      accounts: { monthlyContribution: 0, initialBalances: { taxable: 100_000_000 } },
      returns: { ter: 0.005 },
    })
    const correct = runAccumulate(input).finalBalance.nominal
    // r − f = 6.5% 로 계산하면 661,436,745원이 나온다
    const wrong = 100_000_000 * Math.pow(1.065, 30)
    expect(Math.abs(correct - wrong)).toBeGreaterThan(6_000_000)
  })
})

describe('G-9. Fisher 실질수익률', () => {
  it('보수 차감 후 명목수익률 = 6.839500%', () => {
    expect(netNominalReturn(0.07, 0.0015)).toBeCloseTo(0.068395, 8)
  })

  it('실질 기대수익률 = 4.745098%', () => {
    expect(realReturn(0.0684, 0.02)).toBeCloseTo(0.04745098, 8)
  })

  it('근사식(r − i = 4.84%)과 다르다 — 가정 패널에 표시되는 값이므로 정확해야 한다', () => {
    const exact = realReturn(0.0684, 0.02)
    const approx = 0.0684 - 0.02
    expect(Math.abs(exact - approx)).toBeGreaterThan(0.0009)
  })

  it('물가 0%면 실질 = 명목', () => {
    expect(realReturn(0.07, 0)).toBeCloseTo(0.07, 12)
  })
})
