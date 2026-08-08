import { Close } from '@/components/display/Icon'
import { Button, Label } from '@/components/display/Primitives'
import { InputShell, bareInputClass, inputClass } from '@/components/inputs/Field'
import { formatKRW } from '@/lib/format'
import { useCalculatorStore } from '@/store/calculator'
import type { CashflowEvent } from '@/calc/types'

const MAX_EVENTS = 10

/**
 * 일회성 현금흐름 이벤트 (검토판 §2.10)
 * 주택 구입·자녀 학자금·상속·퇴직금 수령 등은 장기 계획을 완전히 바꾼다.
 */
export function EventEditor() {
  const events = useCalculatorStore((s) => s.input.events)
  const currentAge = useCalculatorStore((s) => s.input.basic.currentAge)
  const patch = useCalculatorStore((s) => s.patch)

  function update(index: number, changes: Partial<CashflowEvent>) {
    const next = events.map((event, i) => (i === index ? { ...event, ...changes } : event))
    patch({ events: next })
  }

  function add() {
    if (events.length >= MAX_EVENTS) return
    const event: CashflowEvent = {
      id: `event-${events.length}-${events.reduce((max, e) => Math.max(max, e.age), currentAge)}`,
      label: '',
      age: currentAge + 5,
      amount: 10_000_000,
      direction: 'outflow',
      basis: 'real',
    }
    patch({ events: [...events, event] })
  }

  function remove(index: number) {
    patch({ events: events.filter((_, i) => i !== index) })
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <Label>일회성 현금흐름</Label>
        <Button onClick={add} disabled={events.length >= MAX_EVENTS} className="px-2 py-1">
          추가
        </Button>
      </div>

      {events.length === 0 && (
        <p className="text-caption text-ink-muted">
          주택 구입, 자녀 학자금, 퇴직금 수령, 상속 등을 등록하면 계산에 반영됩니다.
        </p>
      )}

      {events.map((event, index) => (
        <div key={event.id} className="space-y-2 rounded-control bg-surface-sunken p-2.5">
          <div className="flex gap-1.5">
            <InputShell className="flex-1">
              <input
                type="text"
                value={event.label}
                placeholder="항목명 (예: 주택 구입)"
                maxLength={40}
                onChange={(e) => update(index, { label: e.target.value })}
                className={`${bareInputClass} py-1.5 text-left`}
                aria-label={`이벤트 ${index + 1} 항목명`}
              />
            </InputShell>
            <button
              type="button"
              onClick={() => remove(index)}
              aria-label={`이벤트 ${index + 1} 삭제`}
              className="shrink-0 rounded-control px-1.5 text-ink-muted transition-colors hover:bg-surface hover:text-ink"
            >
              <Close className="size-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <InputShell suffix="세">
              <input
                type="number"
                value={event.age}
                min={19}
                max={110}
                onChange={(e) => update(index, { age: Math.round(Number(e.target.value)) })}
                className={`${bareInputClass} py-1.5`}
                aria-label={`이벤트 ${index + 1} 나이`}
              />
            </InputShell>
            <InputShell suffix="원">
              <input
                type="number"
                value={event.amount}
                min={0}
                onChange={(e) => update(index, { amount: Math.max(0, Number(e.target.value)) })}
                className={`${bareInputClass} py-1.5`}
                aria-label={`이벤트 ${index + 1} 금액`}
              />
            </InputShell>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <select
              value={event.direction}
              onChange={(e) => update(index, { direction: e.target.value as CashflowEvent['direction'] })}
              className={`${inputClass} py-1.5 text-caption`}
              aria-label={`이벤트 ${index + 1} 방향`}
            >
              <option value="outflow">유출 (지출)</option>
              <option value="inflow">유입 (수령)</option>
            </select>
            <select
              value={event.basis}
              onChange={(e) => update(index, { basis: e.target.value as CashflowEvent['basis'] })}
              className={`${inputClass} py-1.5 text-caption`}
              aria-label={`이벤트 ${index + 1} 금액 기준`}
            >
              <option value="real">오늘 가치 기준</option>
              <option value="nominal">해당 시점 명목</option>
            </select>
          </div>

          <p className="text-micro text-ink-muted numeric">
            {event.age}세에 {formatKRW(event.amount)} {event.direction === 'inflow' ? '유입' : '유출'}
            {event.basis === 'real' && ' (오늘 가치 → 해당 시점 명목으로 환산)'}
          </p>
        </div>
      ))}
    </div>
  )
}
