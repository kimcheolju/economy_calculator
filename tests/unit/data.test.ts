/**
 * 세제 데이터 구조 테스트 D-1 ~ D-10 (design/07-test-plan.md §6)
 *
 * D-5는 실제로 발생하기 쉬운 버그다: 0.154 대신 15.4 를 넣으면
 * 세금이 1,540%가 되어 자산이 음수로 간다.
 */

import { describe, expect, it } from 'vitest'
import { RULE_SETS, applyOverrides, applyProposed, getRuleSet, resolveRuleSet } from '@/data/tax'
import type { RuleStatus, Sourced } from '@/data/tax/types'

type AnySourced = Sourced<Record<string, unknown>>

/** 룰셋을 재귀 순회해 Sourced 항목을 모두 수집한다 */
function collectSourced(node: unknown, path: string[] = []): { path: string; item: AnySourced }[] {
  if (typeof node !== 'object' || node === null) return []
  const record = node as Record<string, unknown>

  if ('value' in record && 'source' in record && 'asOf' in record && 'status' in record) {
    return [{ path: path.join('.'), item: record as unknown as AnySourced }]
  }

  const out: { path: string; item: AnySourced }[] = []
  for (const [key, value] of Object.entries(record)) {
    out.push(...collectSourced(value, [...path, key]))
  }
  return out
}

const VALID_STATUSES: RuleStatus[] = ['confirmed', 'proposed', 'needs-verification', 'approximation']

describe.each(RULE_SETS.map((r) => [r.id, r] as const))('%s 룰셋', (_id, rules) => {
  const items = collectSourced(rules)

  it('Sourced 항목이 충분히 수집된다', () => {
    expect(items.length).toBeGreaterThan(30)
  })

  it('D-1. 모든 항목에 source / asOf / status 가 있다', () => {
    for (const { path, item } of items) {
      expect(item.source, path).toBeTruthy()
      expect(item.asOf, path).toBeTruthy()
      expect(VALID_STATUSES, path).toContain(item.status)
    }
  })

  it('D-2. 모든 source 가 유효한 https URL 이다', () => {
    for (const { path, item } of items) {
      expect(item.source, path).toMatch(/^https:\/\/.+/)
      expect(() => new URL(item.source), path).not.toThrow()
    }
  })

  it('D-3. asOf 가 YYYY-MM-DD 형식이며 미래가 아니다', () => {
    const today = new Date().toISOString().slice(0, 10)
    for (const { path, item } of items) {
      expect(item.asOf, path).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(item.asOf <= today, `${path} (${item.asOf})`).toBe(true)
    }
  })

  it("D-4. status: 'proposed' 는 proposed 블록에만 존재한다", () => {
    for (const { path, item } of items) {
      if (item.status === 'proposed') {
        expect(path.startsWith('proposed.'), path).toBe(true)
      }
    }
    // proposed 블록의 항목은 모두 proposed 여야 한다
    for (const { path, item } of items) {
      if (path.startsWith('proposed.')) {
        expect(item.status, path).toBe('proposed')
      }
    }
  })

  it('D-5. 모든 세율이 0~1 범위다 (퍼센트 정수 오입력 방지)', () => {
    for (const { path, item } of items) {
      for (const [key, value] of Object.entries(item.value)) {
        if (typeof value !== 'number') continue
        if (!/rate|ratio/i.test(key)) continue
        expect(value, `${path}.${key}`).toBeGreaterThanOrEqual(0)
        expect(value, `${path}.${key}`).toBeLessThanOrEqual(1)
      }
    }
  })

  it('D-6. 한도 금액이 양수이고 상식적 범위다', () => {
    for (const { path, item } of items) {
      for (const [key, value] of Object.entries(item.value)) {
        if (typeof value !== 'number') continue
        if (!/amount/i.test(key)) continue
        expect(value, `${path}.${key}`).toBeGreaterThan(0)
        expect(value, `${path}.${key}`).toBeLessThan(1_000_000_000)
      }
    }
  })

  it('D-7. 연금저축 세액공제 한도 ≤ 합산 세액공제 한도 ≤ 합산 납입한도', () => {
    const p = rules.pensionAccount
    expect(p.creditLimitSavings.value.amount).toBeLessThanOrEqual(p.creditLimitCombined.value.amount)
    expect(p.creditLimitCombined.value.amount).toBeLessThanOrEqual(p.combinedAnnualLimit.value.amount)
  })

  it('D-8. ISA 연 한도 ≤ 총 한도', () => {
    expect(rules.isa.annualLimit.value.amount).toBeLessThanOrEqual(rules.isa.lifetimeLimit.value.amount)
  })

  it('D-9. 연금소득세율이 연령 증가에 따라 단조 감소한다', () => {
    const w = rules.pensionAccount.withdrawalRates.value
    expect(w.under70).toBeGreaterThanOrEqual(w.under80)
    expect(w.under80).toBeGreaterThanOrEqual(w.over80)
  })

  it('ISA 비과세 한도: 서민형 ≥ 일반형', () => {
    expect(rules.isa.exemptLowIncome.value.amount).toBeGreaterThanOrEqual(rules.isa.exemptGeneral.value.amount)
  })

  it('세액공제율: 저소득 구간이 더 높다', () => {
    const p = rules.pensionAccount
    expect(p.creditRateLow.value.rate).toBeGreaterThan(p.creditRateHigh.value.rate)
  })

  it('국민연금 수급 개시 연령 테이블이 오름차순이다', () => {
    const table = rules.nationalPension.normalAgeByBirthYear.value.table
    for (let i = 1; i < table.length; i++) {
      const prev = table[i - 1]
      const cur = table[i]
      if (!prev || !cur) continue
      expect(cur[0]).toBeGreaterThan(prev[0])
      expect(cur[1]).toBeGreaterThanOrEqual(prev[1])
    }
  })

  it('해외상장 ETF만 기본공제를 가진다', () => {
    expect(rules.etf.foreignListed.value.annualDeduction).toBeGreaterThan(0)
    expect(rules.etf.domesticListedForeign.value.annualDeduction).toBe(0)
    expect(rules.etf.domesticEquity.value.annualDeduction).toBe(0)
  })

  it('국내주식형 ETF 매매차익은 비과세다', () => {
    expect(rules.etf.domesticEquity.value.capitalGainsRate).toBe(0)
  })
})

describe('룰셋 조회', () => {
  it('기본 룰셋을 조회한다', () => {
    expect(getRuleSet().id).toBe('kr-2026')
  })

  it('알 수 없는 ID 는 예외', () => {
    expect(() => getRuleSet('kr-9999')).toThrow()
  })
})

describe('D-10. applyProposed 는 원본을 변형하지 않는다', () => {
  it('원본 룰셋의 값이 유지된다', () => {
    const base = getRuleSet('kr-2026')
    const before = base.isa.exemptGeneral.value.amount
    const applied = applyProposed(base)

    expect(base.isa.exemptGeneral.value.amount).toBe(before)
    expect(applied.isa.exemptGeneral.value.amount).toBe(base.proposed.isaExemptGeneral.value.amount)
    expect(applied.isa.exemptGeneral.status).toBe('proposed')
  })

  it('개정안 적용 시 비과세 한도가 상향된다', () => {
    const applied = applyProposed(getRuleSet('kr-2026'))
    expect(applied.isa.exemptGeneral.value.amount).toBe(5_000_000)
    expect(applied.isa.exemptLowIncome.value.amount).toBe(10_000_000)
  })
})

describe('세율 오버라이드', () => {
  it('오버라이드가 적용되고 사용자 지정으로 표시된다', () => {
    const base = getRuleSet('kr-2026')
    const overridden = applyOverrides(base, { dividendWithholdingRate: 0.2 })
    expect(overridden.dividendWithholding.value.rate).toBe(0.2)
    expect(overridden.dividendWithholding.note).toBe('사용자 지정값')
    expect(base.dividendWithholding.value.rate).toBe(0.154)
  })

  it('빈 오버라이드는 원본을 그대로 반환한다', () => {
    const base = getRuleSet('kr-2026')
    expect(applyOverrides(base, {})).toBe(base)
    expect(applyOverrides(base, undefined)).toBe(base)
  })

  it('resolveRuleSet 이 개정안과 오버라이드를 함께 적용한다', () => {
    const resolved = resolveRuleSet({
      taxRuleSetId: 'kr-2026',
      applyProposedRules: true,
      taxOverrides: { healthInsuranceRate: 0.1 },
    })
    expect(resolved.isa.exemptGeneral.value.amount).toBe(5_000_000)
    expect(resolved.healthInsurance.rate.value.rate).toBe(0.1)
  })
})
