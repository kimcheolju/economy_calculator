import type { ReactNode } from 'react'
import type { TooltipProps } from 'recharts'
import { formatAxisMoney } from '@/lib/format'

/**
 * 차트 공통 크롬 — 축·격자·툴팁의 단일 정의 지점.
 *
 * Recharts 기본 툴팁은 흰 상자에 기본 폰트라 앱의 시각 언어와 이어지지 않는다.
 * 축·격자도 기본값은 본문 텍스트만큼 진해서 데이터보다 눈에 먼저 들어온다.
 * dataviz 지침의 "recessive grid/axes, thin marks"를 여기서 강제한다.
 */

/** 격자는 데이터 뒤로 물러난다 — 실선 hairline 하나면 충분하다. */
export const gridProps = {
  stroke: 'var(--rule)',
  strokeDasharray: '0',
  vertical: false,
} as const

export const axisProps = {
  tick: { fontSize: 11, fill: 'var(--ink-muted)' },
  tickLine: false,
  axisLine: { stroke: 'var(--rule)' },
} as const

export const yAxisProps = {
  ...axisProps,
  tickFormatter: formatAxisMoney,
  width: 52,
} as const

/** 세로 크로스헤어. 면적/선 차트는 기본으로 호버 레이어를 갖는다. */
export const cursorProps = {
  stroke: 'var(--rule-strong)',
  strokeWidth: 1,
} as const

/** 기준선(은퇴·연금 개시·목표자산) 공통 스타일 */
export const referenceLabelStyle = {
  fontSize: 10,
  fill: 'var(--ink-muted)',
} as const

interface ChartTooltipProps extends TooltipProps<number, string> {
  /** 값 포맷터. 기본은 금액 */
  format: (value: number) => string
  /**
   * payload 중 이 dataKey 들만, 이 순서대로 표시한다.
   * 밴드 계산용 보조 시리즈를 숨기는 동시에 표시 순서를 고정한다 —
   * Recharts 는 시리즈 선언 순서로 payload 를 주는데, 누적 면적은 그리기
   * 순서가 강제되므로 그 순서가 읽기 좋은 순서와 일치하지 않는다.
   */
  include?: readonly string[]
  labelSuffix?: string
}

export function ChartTooltip({ active, payload, label, format, include, labelSuffix = '세' }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  const visible = payload.filter((entry) => {
    if (entry.value === undefined || entry.value === null) return false
    return include ? include.includes(String(entry.dataKey)) : true
  })
  const rows = include
    ? [...visible].sort(
        (a, b) => include.indexOf(String(a.dataKey)) - include.indexOf(String(b.dataKey)),
      )
    : visible
  if (rows.length === 0) return null

  return (
    <div className="rounded-panel border border-rule bg-surface px-2.5 py-2 shadow-overlay">
      <p className="mb-1.5 text-micro font-semibold text-ink [font-variant-numeric:tabular-nums]">
        {String(label)}
        {labelSuffix}
      </p>
      <ul className="space-y-0.5">
        {rows.map((entry) => (
          <li key={String(entry.dataKey)} className="flex items-center gap-2 text-micro">
            <span
              className="size-2 shrink-0 rounded-[2px]"
              style={{ background: entry.color ?? 'var(--ink-muted)' }}
            />
            <span className="flex-1 text-ink-secondary">{entry.name}</span>
            <span className="text-ink [font-variant-numeric:tabular-nums]">{format(entry.value as number)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * 차트 위에 놓이는 컨트롤 줄 (기준 전환 등).
 * 필터는 차트 위 한 줄에 모은다 (dataviz — interaction).
 */
export function ChartToolbar({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      {children}
      {note}
    </div>
  )
}

/** 차트 아래 놓이는 설명. 항상 표 뷰로 안내한다 (색 대비 WARN 의 구제 수단). */
export function ChartCaption({ children }: { children: ReactNode }) {
  return <p className="mt-3 border-t border-rule pt-2.5 text-micro text-ink-muted">{children}</p>
}

/** 명목 ↔ 오늘 가치 전환 등 2지선다 토글 */
export function ChartToggle<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-0.5 rounded-control bg-surface-sunken p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={
            'rounded-[5px] px-2.5 py-1 text-micro font-medium transition-colors ' +
            (value === option.value
              ? 'bg-surface text-ink shadow-raised'
              : 'text-ink-muted hover:text-ink-secondary')
          }
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
