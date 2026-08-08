import type { ReactNode } from 'react'
import { Alert } from '@/components/display/Icon'
import { HelpTip } from '@/components/display/Primitives'

interface FieldProps {
  label: string
  htmlFor?: string
  hint?: ReactNode
  error?: string
  warning?: string
  help?: string
  children: ReactNode
}

/**
 * 입력 필드 공통 래퍼.
 * 오류는 인라인으로 표시하되 결과는 마지막 유효값을 유지한다 (design/05-ui-ux.md §12).
 */
export function Field({ label, htmlFor, hint, error, warning, help, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={htmlFor} className="text-caption font-medium text-ink-secondary">
          {label}
        </label>
        {help && <HelpTip text={help} />}
      </div>

      {children}

      {hint && <p className="text-micro text-ink-muted numeric">{hint}</p>}
      {warning && (
        <p className="flex items-start gap-1.5 text-micro text-ink-secondary" role="status">
          <Alert className="mt-px size-3 shrink-0 text-warning" />
          <span>{warning}</span>
        </p>
      )}
      {error && (
        <p className="flex items-start gap-1.5 text-micro font-medium text-critical" role="alert">
          <Alert className="mt-px size-3 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  )
}

/**
 * 입력 껍데기.
 *
 * 단위(원 · % · 세)를 필드 바깥에 두면 값과 단위 사이가 벌어져 한 덩어리로
 * 읽히지 않는다. 껍데기가 테두리와 포커스를 담당하고 안의 input 은 투명하게
 * 두어, 값과 단위가 같은 상자 안에 놓이게 한다.
 */
export function InputShell({
  children,
  suffix,
  invalid,
  className = '',
}: {
  children: ReactNode
  suffix?: string
  invalid?: boolean
  className?: string
}) {
  return (
    <div
      className={`flex items-center gap-1.5 rounded-control border bg-surface px-2.5 transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25 ${
        invalid ? 'border-critical' : 'border-rule-strong'
      } ${className}`}
    >
      {children}
      {suffix && <span className="shrink-0 text-caption text-ink-muted">{suffix}</span>}
    </div>
  )
}

/** InputShell 안에 들어가는 알맹이 input 의 클래스. */
export const bareInputClass =
  'min-w-0 flex-1 bg-transparent py-2 text-right text-body text-ink outline-none ' +
  'placeholder:text-ink-muted focus-visible:outline-none [font-variant-numeric:tabular-nums]'

/** select 처럼 껍데기를 쓰지 않는 요소용. */
export const inputClass =
  'w-full rounded-control border border-rule-strong bg-surface px-2.5 py-2 text-body text-ink ' +
  'transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25'
