/**
 * 스모크 테스트 — 기본값 시나리오의 결과를 출력해 사람이 타당성을 눈으로 확인한다.
 * (design/07-test-plan.md §7 M-1)
 *
 * 출력은 기본적으로 조용하다. 전체 요약을 보려면:
 *   SMOKE_VERBOSE=1 npx vitest run tests/smoke.test.ts
 */

import { describe, expect, it } from 'vitest'
import { runFullSimulation } from '@/calc'
import { formatKRW, formatPercent } from '@/lib/format'
import { RULES, makeInput } from './helpers'

describe('스모크: 기본값 시나리오 요약', () => {
  it('결과를 출력한다', () => {
    const input = makeInput({
      retirement: { nationalPension: { monthlyAmountToday: 1_200_000, startAge: 65 } },
    })
    const r = runFullSimulation(input, RULES)

    const lines = [
      '',
      '━━━ 기본값 시나리오 (35세 → 55세 은퇴, 월 100만원, 7%, 물가 2%, 국민연금 월 120만원) ━━━',
      `은퇴 후 월 사용액 (오늘 가치)  ${formatKRW(r.withdrawal.firstYearMonthlyNet.real)}`,
      `                     (명목)  ${formatKRW(r.withdrawal.firstYearMonthlyNet.nominal)}`,
      `목표 달성률                   ${formatPercent(r.fire.achievementBySpend, 1)}`,
      `예상 은퇴자산 (명목)          ${formatKRW(r.accumulation.finalBalance.nominal)}`,
      `             (오늘 가치)      ${formatKRW(r.accumulation.finalBalance.real)}`,
      `총납입원금                    ${formatKRW(r.accumulation.totalPrincipal)}`,
      `투자수익                      ${formatKRW(r.accumulation.totalGain)}`,
      `축적기 납부 세금              ${formatKRW(r.accumulation.totalTaxPaid)}`,
      `세액공제 환급 누적            ${formatKRW(r.accumulation.totalTaxCredit)}`,
      `ISA 만기 정산 세금            ${formatKRW(r.withdrawal.isaSettlementTax)}`,
      `은퇴 시점 목표 생활비 (명목)   ${formatKRW(r.fire.targetMonthlySpend.nominal)}`,
      `자산 고갈                     ${r.withdrawal.depletionAge ?? '없음'}`,
      '',
      '계좌별 은퇴 시점 잔액:',
      ...Object.entries(r.accumulation.finalAccounts).map(
        ([name, state]) => `  ${name.padEnd(16)} ${formatKRW(state.balance)}`,
      ),
      '',
      '인출률별 필요자산:',
      ...r.fire.comparison.map(
        (row) =>
          `  ${row.method.padEnd(22)} ${formatKRW(row.requiredAssets.nominal, 'compact').padStart(8)}` +
          `  월 실수령 ${formatKRW(row.monthlyNet.real).padStart(12)}  ${row.isAchievable ? '달성' : '부족 ' + formatKRW(row.shortfall, 'compact')}`,
      ),
      '',
      '구간별 현금흐름:',
      ...r.withdrawal.phases.map(
        (phase) =>
          `  ${phase.name.padEnd(10)} ${phase.fromAge}~${phase.toAge}세  ` +
          `월 실수령 ${formatKRW(phase.avgMonthlyNet.real).padStart(12)} (오늘 가치)  구간말 ${formatKRW(phase.endingBalance.nominal, 'compact')}`,
      ),
      '',
      `경고 ${r.warnings.length}건:`,
      ...r.warnings.map((w) => `  [${w.severity}] ${w.message}`),
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
    ]

    if (process.env.SMOKE_VERBOSE) console.log(lines.join('\n'))

    expect(r.withdrawal.firstYearMonthlyNet.real).toBeGreaterThan(0)
    expect(r.assumptions.length).toBeGreaterThan(20)
  })
})
