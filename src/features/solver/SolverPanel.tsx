import { useState } from 'react'
import type { SolverResult } from '@/calc/solve'
import { Alert } from '@/components/display/Icon'
import { Button, Label, Section } from '@/components/display/Primitives'
import { formatAchievement, formatKRW, formatPercent } from '@/lib/format'
import { useCalculatorStore } from '@/store/calculator'
import { useSolvers } from '@/store/useResult'

/**
 * 역산 솔버 (검토판 §2.8)
 * 원안은 전부 정방향 계산이지만 사용자의 실제 질문은 대개 역방향이다.
 */
export function SolverPanel() {
  const [enabled, setEnabled] = useState(false)
  const all = useSolvers(enabled)
  const patch = useCalculatorStore((s) => s.patch)

  /*
   * 필요 월 납입액은 결과 최상단의 "목표를 채우려면" 패널이 항상 보여준다.
   * 여기서 또 보여주면 같은 답이 두 곳에 있어 어느 쪽이 최신인지 헷갈린다.
   */
  const solvers = all?.filter((s) => s.kind !== 'monthlyContribution') ?? null

  function apply(solver: SolverResult) {
    if (solver.value === null) return
    switch (solver.kind) {
      case 'monthlyContribution':
        patch({ accounts: { monthlyContribution: Math.round(solver.value) } })
        break
      case 'requiredReturn':
        patch({ returns: { mode: 'totalReturn', totalReturn: solver.value } })
        break
      case 'earliestRetirementAge':
        patch({ basic: { retirementAge: Math.round(solver.value) } })
        break
    }
  }

  function display(solver: SolverResult): string {
    if (solver.value === null) return '해 없음'
    switch (solver.kind) {
      case 'monthlyContribution':
        return `월 ${formatKRW(solver.value)}`
      case 'requiredReturn':
        return formatPercent(solver.value)
      case 'earliestRetirementAge':
        return `${Math.round(solver.value)}세`
    }
  }

  return (
    <Section title="역산 도구 — 목표에서 거꾸로 계산하기">
      {!enabled ? (
        <div>
          <Button variant="primary" onClick={() => setEnabled(true)}>
            역산 계산하기
          </Button>
          <p className="mt-2.5 text-caption text-ink-muted">
            납입액을 늘리는 것 말고 다른 방법을 계산합니다 — 필요 수익률과 가장 이른 은퇴 나이. 전체 시뮬레이션을
            수십 번 반복하므로 명시적으로 실행합니다. (필요 월 납입액은 위 &ldquo;목표를 채우려면&rdquo;에 항상
            표시됩니다)
          </p>
        </div>
      ) : solvers === null ? (
        <p className="text-caption text-ink-muted">입력값을 확인해 주세요.</p>
      ) : (
        <ul className="divide-y divide-rule border-y border-rule">
          {solvers.map((solver) => (
            <li key={solver.kind} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <Label>{solver.label}</Label>
                <p className="mt-0.5 text-metric font-semibold text-ink numeric">{display(solver)}</p>
                {solver.achievedRatio !== null && solver.value !== null && (
                  <p className="mt-0.5 text-caption text-ink-muted">
                    적용 시 달성률{' '}
                    <span className="numeric">{formatAchievement(solver.achievedRatio)}</span>
                  </p>
                )}
                {solver.note && (
                  <p className="mt-1 flex items-start gap-1.5 text-caption text-ink-secondary">
                    <Alert className="mt-px size-3.5 shrink-0 text-warning" />
                    <span>{solver.note}</span>
                  </p>
                )}
              </div>
              {solver.value !== null && (
                <Button onClick={() => apply(solver)}>입력에 적용</Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
