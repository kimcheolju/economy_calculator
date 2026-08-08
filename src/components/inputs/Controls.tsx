import { useEffect, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp } from '@/components/display/Icon'
import { Field, InputShell, bareInputClass, inputClass } from './Field'

// ─── 나이·정수 입력 ────────────────────────────────────────────────

interface NumberInputProps {
  id: string
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  suffix?: string
  error?: string
  help?: string
  hint?: string
}

/**
 * 정수 입력.
 *
 * 표시값을 로컬 상태로 두는 이유: 값을 직접 바인딩하면 사용자가 지우는 순간
 * `Number('')` 이 0으로 커밋되어 "19 이상이어야 합니다" 오류가 즉시 뜬다.
 * 35 를 고치려고 지웠을 뿐인데 화면이 오류 상태가 되는 것은 잘못된 동작이다.
 *
 * 따라서 타이핑 중에는 **범위 안에 들어온 값만** 커밋하고, 포커스를 잃을 때
 * 범위로 클램프해 확정한다. 자릿수를 채워가는 중간값(`3` → `35`)이 오류를 만들지 않는다.
 */
export function NumberInput({
  id,
  label,
  value,
  onChange,
  min,
  max,
  suffix = '세',
  error,
  help,
  hint,
}: NumberInputProps) {
  const [text, setText] = useState(() => String(value))

  // 외부에서 값이 바뀌면(리셋·공유링크·간단/자세히 전환) 표시값을 동기화한다
  useEffect(() => {
    setText((current) => (Number(current) === value ? current : String(value)))
  }, [value])

  function inRange(n: number): boolean {
    return (min === undefined || n >= min) && (max === undefined || n <= max)
  }

  return (
    <Field label={label} htmlFor={id} error={error} help={help} hint={hint}>
      <InputShell suffix={suffix} invalid={Boolean(error)}>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          className={bareInputClass}
          value={text}
          min={min}
          max={max}
          onChange={(e) => {
            const raw = e.target.value
            setText(raw)
            if (raw.trim() === '') return
            const parsed = Number(raw)
            if (Number.isFinite(parsed) && inRange(parsed)) onChange(Math.round(parsed))
          }}
          onBlur={() => {
            const parsed = Number(text)
            if (text.trim() === '' || !Number.isFinite(parsed)) {
              setText(String(value))
              return
            }
            let next = Math.round(parsed)
            if (min !== undefined) next = Math.max(min, next)
            if (max !== undefined) next = Math.min(max, next)
            setText(String(next))
            if (next !== value) onChange(next)
          }}
        />
      </InputShell>
    </Field>
  )
}

// ─── 세그먼티드 컨트롤 (2~3개 선택) ─────────────────────────────────

interface SegmentedProps<T extends string> {
  label: string
  value: T
  options: readonly { value: T; label: string; help?: string }[]
  onChange: (value: T) => void
  help?: string
  hint?: string
}

/**
 * 선택된 항목을 액센트로 꽉 채우지 않고 표면 위로 살짝 띄운다.
 * 채도 높은 블록이 입력 패널에 여러 개 있으면 정작 중요한 결과 숫자보다
 * 눈에 먼저 들어온다 (design/08-design-system.md §4).
 */
export function Segmented<T extends string>({ label, value, options, onChange, help, hint }: SegmentedProps<T>) {
  return (
    <Field label={label} help={help} hint={hint}>
      <div
        role="radiogroup"
        aria-label={label}
        className="flex gap-0.5 rounded-control bg-surface-sunken p-0.5"
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            title={option.help}
            onClick={() => onChange(option.value)}
            className={
              'flex-1 rounded-[5px] px-2 py-1.5 text-caption font-medium transition-colors ' +
              (value === option.value
                ? 'bg-surface text-ink shadow-raised'
                : 'text-ink-muted hover:text-ink-secondary')
            }
          >
            {option.label}
          </button>
        ))}
      </div>
    </Field>
  )
}

// ─── 셀렉트 (4개 이상) ─────────────────────────────────────────────

interface SelectProps<T extends string> {
  id: string
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
  help?: string
  hint?: ReactNode
}

export function Select<T extends string>({ id, label, value, options, onChange, help, hint }: SelectProps<T>) {
  return (
    <Field label={label} htmlFor={id} help={help} hint={hint}>
      {/* 네이티브 화살표는 플랫폼마다 크기·색이 달라 디자인 언어가 거기서 끊긴다 */}
      <div className="relative">
        <select
          id={id}
          className={`${inputClass} appearance-none pr-8`}
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
      </div>
    </Field>
  )
}

// ─── 토글 ─────────────────────────────────────────────────────────

interface ToggleProps {
  id: string
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  description?: string
}

export function Toggle({ id, label, checked, onChange, description }: ToggleProps) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <label htmlFor={id} className="text-caption font-medium text-ink-secondary">
          {label}
        </label>
        {description && <p className="mt-0.5 text-micro text-ink-muted">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={
          'relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ' +
          (checked ? 'bg-accent' : 'bg-rule-strong')
        }
      >
        <span
          className={
            'absolute top-0.5 size-4 rounded-full bg-surface shadow-raised transition-all duration-150 ' +
            (checked ? 'left-[1.125rem]' : 'left-0.5')
          }
        />
      </button>
    </div>
  )
}

// ─── 우선순위 목록 (드래그 대신 키보드 접근 가능한 버튼) ────────────────

interface PriorityListProps {
  label: string
  items: readonly string[]
  labels: Readonly<Record<string, string>>
  onChange: (items: string[]) => void
  help?: string
  annotations?: Readonly<Record<string, string>>
}

/**
 * 순서 변경은 위/아래 버튼으로 제공한다.
 * 드래그만 지원하면 키보드 사용자가 조작할 수 없다 (design/05-ui-ux.md §11).
 */
export function PriorityList({ label, items, labels, onChange, help, annotations }: PriorityListProps) {
  function move(index: number, delta: number) {
    const next = [...items]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    const a = next[index]
    const b = next[target]
    if (a === undefined || b === undefined) return
    next[index] = b
    next[target] = a
    onChange(next)
  }

  return (
    <Field label={label} help={help}>
      <ol className="overflow-hidden rounded-control border border-rule">
        {items.map((item, index) => (
          <li
            key={item}
            className="flex items-center gap-2 border-b border-rule bg-surface px-2.5 py-1.5 last:border-b-0"
          >
            <span className="w-3.5 shrink-0 text-micro text-ink-muted [font-variant-numeric:tabular-nums]">
              {index + 1}
            </span>
            <span className="min-w-0 flex-1 truncate text-caption text-ink">{labels[item] ?? item}</span>
            {annotations?.[item] && (
              <span className="shrink-0 text-micro text-ink-muted [font-variant-numeric:tabular-nums]">
                {annotations[item]}
              </span>
            )}
            <div className="flex shrink-0">
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                aria-label={`${labels[item] ?? item} 위로`}
                className="rounded p-0.5 text-ink-muted transition-colors hover:text-ink disabled:pointer-events-none disabled:opacity-25"
              >
                <ChevronUp className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === items.length - 1}
                aria-label={`${labels[item] ?? item} 아래로`}
                className="rounded p-0.5 text-ink-muted transition-colors hover:text-ink disabled:pointer-events-none disabled:opacity-25"
              >
                <ChevronDown className="size-3.5" />
              </button>
            </div>
          </li>
        ))}
      </ol>
    </Field>
  )
}
