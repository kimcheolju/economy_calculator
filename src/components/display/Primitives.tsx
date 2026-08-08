import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Assumption } from '@/calc/types'
import { formatAchievement } from '@/lib/format'
import { Alert, Check, ChevronDown, Close, Formula, Info } from './Icon'

/**
 * 공통 표시 프리미티브 — 시각 언어의 단일 정의 지점.
 * 규칙과 근거는 design/08-design-system.md.
 *
 * 핵심 원칙: 위계는 크기가 아니라 잉크 3단계(ink / ink-secondary / ink-muted)와
 * 여백이 만든다. 모든 것을 테두리 있는 카드로 감싸지 않는다.
 */

// ─── 라벨 ─────────────────────────────────────────────────────────

/** 지표·필드 위에 붙는 작은 라벨. 앱 전체에서 이 한 가지 형태만 쓴다. */
export function Label({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`text-caption font-medium text-ink-secondary ${className}`}>{children}</span>
  )
}

/** 값 아래 붙는 부기 텍스트. */
export function Note({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`text-caption text-ink-muted ${className}`}>{children}</p>
}

// ─── 패널 ─────────────────────────────────────────────────────────

/**
 * 내용을 담는 기본 컨테이너.
 * 테두리는 hairline 하나뿐이고 그림자는 쓰지 않는다 — 금융 도구에서 떠 있는
 * 카드는 정보를 읽는 데 도움이 되지 않는다.
 */
export function Panel({
  title,
  action,
  children,
  className = '',
}: {
  title?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={`rounded-panel border border-rule bg-surface ${className}`}
    >
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-rule px-4 py-2.5">
          {title && <h2 className="text-body font-semibold text-ink">{title}</h2>}
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

/** 하위 호환 별칭 — 기존 호출부가 그대로 동작한다. */
export const Card = Panel

/** 패널 안에서 구획을 나누는 hairline. */
export function Divider({ className = '' }: { className?: string }) {
  return <hr className={`border-0 border-t border-rule ${className}`} />
}

/**
 * 섹션 안에서 관련 입력을 묶는 하위 그룹 (국민연금, 기타 연금 등).
 * 패널을 중첩하면 테두리가 두 겹이 되므로 배경만 눌러 구분한다.
 */
export function FieldGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-control bg-surface-sunken p-3">
      <p className="mb-2.5 text-caption font-semibold text-ink">{title}</p>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

// ─── 섹션 (아코디언) ───────────────────────────────────────────────

interface SectionProps {
  title: string
  badge?: string
  defaultOpen?: boolean
  children: ReactNode
}

export function Section({ title, badge, defaultOpen = false, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="rounded-panel border border-rule bg-surface">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="group flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <ChevronDown
          className={`size-4 shrink-0 text-ink-muted transition-transform duration-150 ${
            open ? '' : '-rotate-90'
          }`}
        />
        <span className="flex-1 text-body font-semibold text-ink">{title}</span>
        {badge && <span className="text-caption text-ink-muted numeric">{badge}</span>}
      </button>
      {open && <div className="space-y-4 border-t border-rule px-4 py-4">{children}</div>}
    </section>
  )
}

// ─── 지표 ─────────────────────────────────────────────────────────

/**
 * 지표 하나. 테두리 없이 라벨 + 값 + 부기로만 구성한다.
 * 격자 안에 나란히 놓으면 구획은 여백과 hairline 이 만든다.
 */
export function Metric({
  label,
  value,
  sub,
  action,
}: {
  label: string
  value: string
  sub?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        {action}
      </div>
      <p className="mt-1.5 text-metric font-semibold text-ink numeric" aria-live="polite">
        {value}
      </p>
      {sub && <div className="mt-1 text-caption text-ink-muted">{sub}</div>}
    </div>
  )
}

/** 하위 호환 별칭. emphasis 는 더 이상 테두리를 바꾸지 않는다 — 위계는 배치가 만든다. */
export function MetricCard({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub?: ReactNode
  emphasis?: boolean
}) {
  return <Metric label={label} value={value} sub={sub} />
}

/**
 * 화면에서 가장 중요한 단 하나의 값.
 * CLAUDE.md §7 이 정한 1순위 — "오늘 돈 가치로 매달 얼마".
 */
export function HeroMetric({
  label,
  value,
  sub,
  action,
}: {
  label: string
  value: string
  sub?: ReactNode
  action?: ReactNode
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <Label>{label}</Label>
        {action}
      </div>
      <p
        className="mt-2 text-hero font-semibold tracking-tight text-accent-ink numeric"
        aria-live="polite"
      >
        {value}
      </p>
      {sub && <div className="mt-2 space-y-0.5">{sub}</div>}
    </div>
  )
}

// ─── 달성률 게이지 ─────────────────────────────────────────────────

/**
 * 빨강은 쓰지 않는다 — 사용자를 겁주는 것이 목적이 아니다 (design/05-ui-ux.md §3).
 * 상태색은 단독으로 의미를 지지 않는다: 퍼센트 수치와 100% 도달 시 체크 아이콘이
 * 함께 간다 (dataviz — 상태색은 항상 아이콘+레이블과 동반).
 */
export function Gauge({ ratio, label }: { ratio: number; label: string }) {
  const percent = Math.max(0, Math.min(100, ratio * 100))
  const reached = ratio >= 1
  const color = reached ? 'bg-good' : ratio >= 0.8 ? 'bg-warning' : 'bg-serious'

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        <span className="flex items-center gap-1 text-title font-semibold text-ink numeric">
          {reached && <Check className="size-4 text-good" />}
          <span aria-live="polite">{formatAchievement(ratio)}</span>
        </span>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-sunken"
        role="progressbar"
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className={`h-full rounded-full transition-[width] duration-200 ${color}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

// ─── 원금/수익 비중 바 ─────────────────────────────────────────────

/**
 * 인접한 채움 사이에 2px 표면 간격을 둔다 (dataviz mark spec).
 * 색만으로 구분하지 않도록 호출부에서 범례를 함께 제공한다.
 */
export function SplitBar({ principal, gain }: { principal: number; gain: number }) {
  const safeGain = Math.max(0, gain)
  const total = Math.max(1, principal + safeGain)
  const principalPct = (principal / total) * 100
  return (
    <div className="mt-2 flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-surface-sunken">
      <div
        className="h-full rounded-full bg-series-1"
        style={{ width: `${principalPct}%` }}
        title={`납입원금 ${principalPct.toFixed(0)}%`}
      />
      <div
        className="h-full rounded-full bg-series-2"
        style={{ width: `${100 - principalPct}%` }}
        title={`투자수익 ${(100 - principalPct).toFixed(0)}%`}
      />
    </div>
  )
}

/** 색 옆에 반드시 붙는 직접 레이블. 색 단독으로 계열을 구분하지 않는다. */
export function SeriesKey({ items }: { items: readonly { color: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5 text-caption text-ink-secondary">
          <span className={`size-2 shrink-0 rounded-[2px] ${item.color}`} />
          {item.label}
        </span>
      ))}
    </div>
  )
}

// ─── 버튼 ─────────────────────────────────────────────────────────

/**
 * 버튼은 세 가지만 있다.
 * primary 는 화면당 하나 — 여러 개를 액센트로 칠하면 어느 것도 강조되지 않는다.
 */
const BUTTON_VARIANTS = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover',
  secondary: 'border border-rule-strong text-ink-secondary hover:bg-surface-sunken hover:text-ink',
  ghost: 'text-ink-secondary hover:bg-surface-sunken hover:text-ink',
} as const

export function Button({
  variant = 'secondary',
  icon,
  children,
  onClick,
  disabled,
  type = 'button',
  className = '',
}: {
  variant?: keyof typeof BUTTON_VARIANTS
  icon?: ReactNode
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  type?: 'button' | 'submit'
  className?: string
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-control px-3 py-1.5 text-caption font-medium transition-colors disabled:pointer-events-none disabled:opacity-40 ${BUTTON_VARIANTS[variant]} ${className}`}
    >
      {icon}
      {children}
    </button>
  )
}

// ─── 상태 배지 ────────────────────────────────────────────────────

const BADGE_STYLES: Record<string, { label: string; className: string }> = {
  confirmed: { label: '확정', className: 'text-ink-muted' },
  proposed: { label: '개정안', className: 'text-accent-ink ring-1 ring-accent/40' },
  'needs-verification': {
    label: '검증필요',
    className: 'bg-warning/20 text-ink ring-1 ring-warning/50',
  },
  approximation: { label: '근사', className: 'text-ink-muted italic' },
  userOverride: { label: '사용자 지정', className: 'text-ink-secondary ring-1 ring-rule-strong' },
}

export function StatusBadge({ status }: { status: Assumption['status'] }) {
  if (!status) return null
  const style = BADGE_STYLES[status]
  if (!style) return null
  return (
    <span className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-micro font-medium ${style.className}`}>
      {style.label}
    </span>
  )
}

// ─── 인라인 알림 ───────────────────────────────────────────────────

/** 경고·안내. 아이콘 + 텍스트가 항상 함께 간다 (색 단독 금지). */
export function Callout({
  tone = 'info',
  children,
  onDismiss,
}: {
  tone?: 'info' | 'warning'
  children: ReactNode
  onDismiss?: () => void
}) {
  const warning = tone === 'warning'
  return (
    <div
      className={`flex items-start gap-2 rounded-control px-3 py-2 text-caption ${
        warning ? 'bg-warning/12 text-ink' : 'bg-surface-sunken text-ink-secondary'
      }`}
      role={warning ? 'status' : undefined}
    >
      {warning ? (
        <Alert className="mt-px size-3.5 shrink-0 text-warning" />
      ) : (
        <Info className="mt-px size-3.5 shrink-0 text-ink-muted" />
      )}
      <div className="min-w-0 flex-1">{children}</div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="알림 닫기"
          className="shrink-0 rounded p-0.5 text-ink-muted transition-colors hover:text-ink"
        >
          <Close className="size-3.5" />
        </button>
      )}
    </div>
  )
}

// ─── 도움말 툴팁 ───────────────────────────────────────────────────

/** 라벨 옆 도움말. title 속성만으로는 터치 기기에서 접근할 수 없어 버튼으로 둔다. */
export function HelpTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={text}
        className="rounded text-ink-muted transition-colors hover:text-ink-secondary"
      >
        <Info className="size-3.5" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 top-full z-30 mt-1 hidden w-56 rounded-control border border-rule bg-surface p-2 text-caption font-normal text-ink-secondary shadow-overlay group-hover:block group-focus-within:block"
      >
        {text}
      </span>
    </span>
  )
}

// ─── 계산식 팝오버 ─────────────────────────────────────────────────

export function FormulaPopover({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  // 바깥 클릭·ESC 로 닫힌다 — 팝오버를 열어둔 채 다른 값을 조작하면 가려진다
  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <span ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={`${title} 계산식 보기`}
        className={`rounded p-1 transition-colors ${
          open ? 'bg-accent-wash text-accent-ink' : 'text-ink-muted hover:bg-surface-sunken hover:text-ink-secondary'
        }`}
      >
        <Formula className="size-4" />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-80 max-w-[80vw] rounded-panel border border-rule bg-surface p-3 text-left shadow-overlay">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-caption font-semibold text-ink">{title}</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="닫기"
              className="rounded p-0.5 text-ink-muted transition-colors hover:text-ink"
            >
              <Close className="size-3.5" />
            </button>
          </div>
          <div className="space-y-1 text-micro leading-relaxed text-ink-secondary numeric">{children}</div>
        </div>
      )}
    </span>
  )
}
