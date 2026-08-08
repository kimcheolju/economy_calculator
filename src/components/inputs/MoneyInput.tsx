import { useEffect, useState } from 'react'
import { formatKRW, formatMoneyHint } from '@/lib/format'
import { Field, InputShell, bareInputClass } from './Field'

interface MoneyInputProps {
  id: string
  label: string
  value: number
  onChange: (value: number) => void
  presets?: readonly number[]
  error?: string
  help?: string
  max?: number
}

/**
 * 금액 입력 (design/05-ui-ux.md §10)
 *
 * 입력 중 한국식 단위 힌트를 실시간으로 보여준다 —
 * 0 하나 차이 오타는 금융 계산기에서 가장 흔한 사용자 실수다.
 */
export function MoneyInput({ id, label, value, onChange, presets, error, help, max }: MoneyInputProps) {
  const [text, setText] = useState(() => String(value))

  // 외부에서 값이 바뀌면(프리셋·리셋·공유링크) 표시값을 동기화한다
  useEffect(() => {
    setText((current) => (Number(current.replace(/,/g, '')) === value ? current : String(value)))
  }, [value])

  function commit(raw: string) {
    const cleaned = raw.replace(/[^\d.-]/g, '')
    const parsed = cleaned === '' ? 0 : Number(cleaned)
    if (!Number.isFinite(parsed)) return
    const clamped = max !== undefined ? Math.min(parsed, max) : parsed
    onChange(Math.max(0, Math.round(clamped)))
  }

  return (
    <Field label={label} htmlFor={id} hint={formatMoneyHint(value)} error={error} help={help}>
      <InputShell suffix="원" invalid={Boolean(error)}>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          className={bareInputClass}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            commit(e.target.value)
          }}
          onBlur={() => setText(String(value))}
          aria-describedby={`${id}-hint`}
        />
      </InputShell>

      {presets && presets.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-pressed={value === preset}
              onClick={() => {
                setText(String(preset))
                onChange(preset)
              }}
              className={
                'rounded-full px-2 py-0.5 text-micro font-medium transition-colors [font-variant-numeric:tabular-nums] ' +
                (value === preset
                  ? 'bg-accent text-on-accent'
                  : 'bg-surface-sunken text-ink-secondary hover:text-ink')
              }
            >
              {formatKRW(preset, 'compact')}
            </button>
          ))}
        </div>
      )}
    </Field>
  )
}
