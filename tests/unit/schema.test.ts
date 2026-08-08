/**
 * 단위 테스트 — schema.ts, url-codec.ts (design/07-test-plan.md §4)
 */

import { describe, expect, it } from 'vitest'
import { DEFAULT_INPUT } from '@/lib/defaults'
import { describeErrors, parseStoredInput, validateInput } from '@/lib/schema'
import { __internal } from '@/lib/url-codec'
import { makeInput } from '../helpers'

describe('validateInput', () => {
  it('기본값은 유효하다', () => {
    expect(validateInput(DEFAULT_INPUT)).toEqual({})
  })

  it('은퇴 나이 ≤ 현재 나이 → 검증 실패', () => {
    const errors = validateInput(makeInput({ basic: { currentAge: 50, retirementAge: 50 } }))
    expect(errors['basic.retirementAge']).toBeTruthy()
  })

  it('종료 나이 ≤ 은퇴 나이 → 검증 실패', () => {
    const errors = validateInput(makeInput({ basic: { retirementAge: 60, endAge: 60 } }))
    expect(errors['basic.endAge']).toBeTruthy()
  })

  it('배당수익률 > 총수익률 → 검증 실패', () => {
    const errors = validateInput(
      makeInput({ returns: { mode: 'totalReturn', totalReturn: 0.02, dividendYield: 0.05 } }),
    )
    expect(errors['returns.dividendYield']).toBeTruthy()
  })

  it('범위를 벗어난 값 → 검증 실패', () => {
    expect(validateInput(makeInput({ returns: { totalReturn: 0.5 } }))['returns.totalReturn']).toBeTruthy()
    expect(validateInput(makeInput({ basic: { currentAge: 10 } }))['basic.currentAge']).toBeTruthy()
    expect(
      validateInput(makeInput({ retirement: { withdrawalRate: 0.5 } }))['retirement.withdrawalRate'],
    ).toBeTruthy()
  })

  it('음수 금액 → 검증 실패', () => {
    expect(
      validateInput(makeInput({ accounts: { monthlyContribution: -1 } }))['accounts.monthlyContribution'],
    ).toBeTruthy()
  })

  it('메시지는 한국어이며 사용자가 보는 단위를 쓴다 (Zod 기본 영어 메시지 금지)', () => {
    const age = validateInput(makeInput({ basic: { currentAge: 10 } }))['basic.currentAge']
    expect(age).toBe('19세 이상이어야 합니다')

    const rate = validateInput(makeInput({ returns: { totalReturn: 0.5 } }))['returns.totalReturn']
    // 내부값 0.2 가 아니라 화면 단위 20% 로 안내해야 한다
    expect(rate).toBe('20% 이하여야 합니다')

    const money = validateInput(
      makeInput({ accounts: { monthlyContribution: -1 } }),
    )['accounts.monthlyContribution']
    expect(money).toBe('0원 이상이어야 합니다')

    for (const message of Object.values(validateInput(makeInput({ basic: { currentAge: 10 } })))) {
      expect(message).not.toMatch(/[A-Za-z]{4,}/)
    }
  })

  it('describeErrors 는 항목 이름을 붙인다', () => {
    const errors = validateInput(makeInput({ basic: { currentAge: 10 } }))
    expect(describeErrors(errors)).toContain('현재 나이 — 19세 이상이어야 합니다')
  })

  it('일회성 이벤트는 최대 10건', () => {
    const events = Array.from({ length: 11 }, (_, i) => ({
      id: `e${i}`,
      label: '이벤트',
      age: 50,
      amount: 1_000_000,
      direction: 'inflow' as const,
      basis: 'nominal' as const,
    }))
    expect(validateInput(makeInput({ events }))['events']).toBeTruthy()
  })
})

describe('parseStoredInput', () => {
  it('유효한 값은 그대로 통과한다', () => {
    const result = parseStoredInput(DEFAULT_INPUT)
    expect(result.ok).toBe(true)
    expect(result.input.basic.currentAge).toBe(35)
  })

  it('손상된 값은 기본값으로 폴백한다 (NaN 전파 방지)', () => {
    const result = parseStoredInput({ schemaVersion: 1, basic: 'broken' })
    expect(result.ok).toBe(false)
    expect(result.input).toEqual(DEFAULT_INPUT)
  })

  it('문자열로 저장된 숫자는 폴백한다', () => {
    const broken = { ...DEFAULT_INPUT, accounts: { ...DEFAULT_INPUT.accounts, monthlyContribution: '1000000' } }
    expect(parseStoredInput(broken).ok).toBe(false)
  })

  it('null / undefined 도 안전하게 폴백한다', () => {
    expect(parseStoredInput(null).ok).toBe(false)
    expect(parseStoredInput(undefined).ok).toBe(false)
    expect(parseStoredInput('문자열').ok).toBe(false)
  })

  it('미래 schemaVersion 은 폴백한다', () => {
    expect(parseStoredInput({ ...DEFAULT_INPUT, schemaVersion: 99 }).ok).toBe(false)
  })
})

describe('url-codec — diff / merge', () => {
  const { diff, deepMerge } = __internal

  it('기본값과 같으면 diff 가 undefined', () => {
    expect(diff(DEFAULT_INPUT, DEFAULT_INPUT)).toBeUndefined()
  })

  it('변경된 필드만 남는다', () => {
    const changed = makeInput({ accounts: { monthlyContribution: 2_000_000 } })
    expect(diff(changed, DEFAULT_INPUT)).toEqual({ accounts: { monthlyContribution: 2_000_000 } })
  })

  it('diff → merge 왕복이 성립한다', () => {
    const changed = makeInput({
      basic: { currentAge: 40, retirementAge: 58 },
      returns: { totalReturn: 0.08 },
      retirement: { targetMonthlySpendToday: 4_500_000, strategy: 'vpw' },
    })
    const patch = diff(changed, DEFAULT_INPUT)
    expect(deepMerge(DEFAULT_INPUT, patch)).toEqual(changed)
  })

  it('배열은 통째로 비교한다', () => {
    const changed = makeInput({ accounts: { allocationPriority: ['isa', 'taxable'] } })
    expect(diff(changed, DEFAULT_INPUT)).toEqual({ accounts: { allocationPriority: ['isa', 'taxable'] } })
  })

  it('base64url 왕복이 성립한다', () => {
    const { toBase64Url, fromBase64Url } = __internal
    const bytes = new Uint8Array([0, 1, 250, 255, 62, 63, 100])
    expect([...fromBase64Url(toBase64Url(bytes))]).toEqual([...bytes])
  })

  it('base64url 은 URL 안전 문자만 쓴다', () => {
    const { toBase64Url } = __internal
    const bytes = new Uint8Array(Array.from({ length: 256 }, (_, i) => i))
    expect(toBase64Url(bytes)).not.toMatch(/[+/=]/)
  })
})
