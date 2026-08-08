import type { Assumption, CalculationResult, Warning } from '@/calc/types'
import { Alert, External, Info } from '@/components/display/Icon'
import { Section, StatusBadge } from '@/components/display/Primitives'

const GROUP_ORDER: Assumption['group'][] = ['수익률', '계산 규약', '적용 세제', '한계']

/**
 * 가정 패널 (R11, 원안 8번, design/05-ui-ux.md §7)
 *
 * 항상 접근 가능해야 한다. 결과 옆에 가정이 없으면 미완성이다 (CLAUDE.md R-8).
 */
export function AssumptionsPanel({ result }: { result: CalculationResult }) {
  const grouped = GROUP_ORDER.map((group) => ({
    group,
    items: result.assumptions.filter((a) => a.group === group),
  })).filter((entry) => entry.items.length > 0)

  const needsVerification = result.assumptions.filter((a) => a.status === 'needs-verification').length

  return (
    <Section
      title="사용된 가정 및 계산 근거"
      badge={
        needsVerification > 0
          ? `${result.assumptions.length}개 · 검증필요 ${needsVerification}`
          : `${result.assumptions.length}개`
      }
    >
      {grouped.map(({ group, items }) => (
        <div key={group}>
          <h3 className="mb-2 text-micro font-semibold tracking-wide text-ink-muted">{group}</h3>

          {group === '한계' ? (
            <ul className="space-y-1">
              {items.map((assumption, index) => (
                <li key={`${group}-${index}`} className="flex gap-2 text-caption text-ink-secondary">
                  <span aria-hidden className="text-ink-muted">
                    ·
                  </span>
                  <span>{assumption.value}</span>
                </li>
              ))}
            </ul>
          ) : (
            <dl className="divide-y divide-rule border-t border-rule">
              {items.map((assumption, index) => (
                <div key={`${group}-${index}`} className="py-1.5 sm:flex sm:items-baseline sm:gap-3">
                  <dt className="shrink-0 text-caption text-ink-muted sm:w-44">{assumption.label}</dt>
                  <dd className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-caption">
                    <span className="font-medium text-ink [font-variant-numeric:tabular-nums]">
                      {assumption.value}
                    </span>
                    <StatusBadge status={assumption.status} />
                    {assumption.source && (
                      <a
                        href={assumption.source}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-0.5 text-accent-ink underline decoration-accent/30 underline-offset-2 transition-colors hover:decoration-accent"
                      >
                        출처
                        <External className="size-3" />
                      </a>
                    )}
                    {assumption.asOf && (
                      <span className="text-ink-muted [font-variant-numeric:tabular-nums]">{assumption.asOf}</span>
                    )}
                    {assumption.derivation && (
                      <span className="block w-full text-micro text-ink-muted [font-variant-numeric:tabular-nums]">
                        {assumption.derivation}
                      </span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      ))}
    </Section>
  )
}

/**
 * 심각도는 색만으로 구분하지 않는다 — 아이콘과 위치(정렬 순서)가 함께 진다.
 * 빨강은 차단성 오류에만 쓴다 (design/05-ui-ux.md §13 "겁주지 않는다").
 */
const SEVERITY: Record<Warning['severity'], { className: string; Icon: typeof Alert }> = {
  error: { className: 'bg-critical/12 text-ink', Icon: Alert },
  warn: { className: 'bg-warning/15 text-ink', Icon: Alert },
  info: { className: 'bg-surface-sunken text-ink-secondary', Icon: Info },
}

const ICON_TONE: Record<Warning['severity'], string> = {
  error: 'text-critical',
  warn: 'text-warning',
  info: 'text-ink-muted',
}

export function WarningList({ warnings }: { warnings: readonly Warning[] }) {
  if (warnings.length === 0) return null

  // 심각도 순으로 정렬해 중요한 것이 먼저 보이게 한다
  const order: Warning['severity'][] = ['error', 'warn', 'info']
  const sorted = [...warnings].sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity))

  return (
    <ul className="space-y-1.5" aria-label="계산 관련 안내">
      {sorted.map((warning) => {
        const { className, Icon } = SEVERITY[warning.severity]
        return (
          <li
            key={warning.code}
            className={`flex items-start gap-2 rounded-control px-3 py-2 text-caption ${className}`}
          >
            <Icon className={`mt-px size-3.5 shrink-0 ${ICON_TONE[warning.severity]}`} />
            <span className="min-w-0 flex-1">{warning.message}</span>
          </li>
        )
      })}
    </ul>
  )
}
