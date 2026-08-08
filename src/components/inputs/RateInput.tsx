import type { CSSProperties } from 'react'
import { Field, InputShell, bareInputClass } from './Field'

interface RateInputProps {
  id: string
  label: string
  /** 소수 (0.07 = 7%) */
  value: number
  onChange: (value: number) => void
  /** 슬라이더 범위 (퍼센트 단위) */
  sliderMin?: number
  sliderMax?: number
  step?: number
  /** 직접 입력 허용 범위 (퍼센트 단위) */
  min?: number
  max?: number
  digits?: number
  error?: string
  warning?: string
  help?: string
  hint?: string
}

/**
 * 비율 입력 — 슬라이더 + 직접 입력을 함께 제공한다 (design/05-ui-ux.md §10).
 * 슬라이더만 있으면 정확한 값을 넣을 수 없고, 숫자 입력만 있으면 탐색적 조작이 어렵다.
 */
export function RateInput({
  id,
  label,
  value,
  onChange,
  sliderMin = 0,
  sliderMax = 15,
  step = 0.1,
  min = -100,
  max = 100,
  digits = 2,
  error,
  warning,
  help,
  hint,
}: RateInputProps) {
  const percent = value * 100
  const sliderValue = Math.min(sliderMax, Math.max(sliderMin, percent))
  const span = sliderMax - sliderMin
  const fill = span > 0 ? ((sliderValue - sliderMin) / span) * 100 : 0

  function commit(nextPercent: number) {
    if (!Number.isFinite(nextPercent)) return
    const clamped = Math.min(max, Math.max(min, nextPercent))
    onChange(clamped / 100)
  }

  return (
    <Field label={label} htmlFor={id} error={error} warning={warning} help={help} hint={hint}>
      <div className="flex items-center gap-3">
        <input
          type="range"
          className="min-w-0 flex-1"
          style={{ '--range-fill': `${fill}%` } as CSSProperties}
          min={sliderMin}
          max={sliderMax}
          step={step}
          value={sliderValue}
          onChange={(e) => commit(Number(e.target.value))}
          aria-label={`${label} 슬라이더`}
        />
        <InputShell suffix="%" invalid={Boolean(error)} className="w-[5.5rem] shrink-0">
          <input
            id={id}
            type="number"
            inputMode="decimal"
            className={bareInputClass}
            step={step}
            value={Number(percent.toFixed(digits))}
            onChange={(e) => commit(Number(e.target.value))}
          />
        </InputShell>
      </div>
    </Field>
  )
}
