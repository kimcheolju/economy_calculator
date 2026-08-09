/**
 * 간단 모드 입력 (design/05-ui-ux.md §2 "입력 밀도")
 *
 * 사용자만 알 수 있고 대신 정해줄 수 없는 5가지만 묻는다.
 * 나머지는 DEFAULT_INPUT 의 보수적 기본값이 그대로 계산에 들어간다 —
 * 계산 로직은 자세히 모드와 완전히 동일하고, 노출되는 입력의 개수만 다르다.
 */

import { useMemo, useState } from 'react'
import { ACCOUNT_LABELS, ACCOUNT_TYPES, type AccountType } from '@/calc/types'
import { normalizeReturns } from '@/calc/rates'
import { NumberInput, Segmented } from '@/components/inputs/Controls'
import { MoneyInput } from '@/components/inputs/MoneyInput'
import { Button, Callout, Disclosure } from '@/components/display/Primitives'
import { MONEY_PRESETS, SAVINGS_PRESETS } from '@/lib/defaults'
import { formatKRW, formatPercent } from '@/lib/format'
import { describeErrors } from '@/lib/schema'
import { DebtFields } from './DebtFields'
import { useCalculatorStore } from '@/store/calculator'

type Balances = Record<AccountType, number>

const ZERO_BALANCES: Balances = { taxable: 0, isa: 0, pensionSavings: 0, irp: 0, dcRetirement: 0 }

/**
 * 인출률 프리셋 (design/05-ui-ux.md §2).
 *
 * 인출률은 결과를 33% 흔든다 — 3.0% 면 필요자산 17.8억, 4.0% 면 13.4억.
 * 기본값으로 조용히 정해줄 수 있는 값이 아니라서 간단 모드에도 노출한다.
 * 다만 "3.5%"라는 숫자는 비전문가에게 의미가 없으므로 결과로 이름 붙인다.
 */
const WITHDRAWAL_PRESETS = [
  { key: 'safe', rate: 0.03, label: '적게 쓰기', hint: '오래 버팁니다' },
  { key: 'balanced', rate: 0.035, label: '보통', hint: '기본값' },
  { key: 'spend', rate: 0.04, label: '많이 쓰기', hint: '일찍 소진될 수 있습니다' },
] as const

type WithdrawalKey = (typeof WITHDRAWAL_PRESETS)[number]['key'] | 'custom'

function withdrawalKeyOf(rate: number): WithdrawalKey {
  const hit = WITHDRAWAL_PRESETS.find((p) => Math.abs(p.rate - rate) < 1e-9)
  return hit ? hit.key : 'custom'
}

/** 간단 모드에서 보이는 필드 — 여기 없는 경로의 오류는 화면 밖에 있다 */
const VISIBLE_ERROR_PATHS = new Set([
  'basic.currentAge',
  'basic.retirementAge',
  'accounts.monthlyContribution',
  'retirement.targetMonthlySpendToday',
  'retirement.withdrawalRate',
])

function sumBalances(balances: Readonly<Balances>): number {
  return ACCOUNT_TYPES.reduce((total, account) => total + balances[account], 0)
}

/**
 * 합계 하나를 계좌별 잔액으로 되돌린다.
 *
 * 계좌 구분이 없으면 전액 일반계좌로 넣는다 — 과세가 가장 불리한 계좌라
 * 결과를 과대추정하지 않는다. 자세히 모드에서 이미 계좌를 나눠둔 사용자는
 * 그 비율을 유지하고, 반올림 잔차는 일반계좌가 흡수해 합계가 정확히 일치한다.
 */
function spreadTotal(current: Readonly<Balances>, total: number): Balances {
  const sum = sumBalances(current)
  if (sum <= 0) return { ...ZERO_BALANCES, taxable: total }

  const next = { ...ZERO_BALANCES }
  let assigned = 0
  for (const account of ACCOUNT_TYPES) {
    if (account === 'taxable') continue
    const scaled = Math.round((current[account] * total) / sum)
    next[account] = scaled
    assigned += scaled
  }
  next.taxable = Math.max(0, total - assigned)
  return next
}

export function SimpleInputs({ onSwitchToDetailed }: { onSwitchToDetailed: () => void }) {
  const input = useCalculatorStore((s) => s.input)
  const errors = useCalculatorStore((s) => s.validationErrors)
  const patch = useCalculatorStore((s) => s.patch)

  const totalSavings = sumBalances(input.accounts.initialBalances)
  const normalized = useMemo(() => normalizeReturns(input.returns), [input.returns])
  const withdrawalKey = withdrawalKeyOf(input.retirement.withdrawalRate)

  // 이미 세제 혜택 계좌에 잔액이 있으면 접어두지 않는다 — 접힌 채로 두면
  // 전액 일반계좌로 계산된 줄 모르고 세금이 과다 계산된 결과를 보게 된다.
  const [splitInitiallyOpen] = useState(
    () => sumBalances(input.accounts.initialBalances) - input.accounts.initialBalances.taxable > 0,
  )

  // 숨겨둔 필드의 오류를 화면 밖에 방치하지 않는다 (예: 은퇴 나이 > 자산 사용 종료 나이)
  const hiddenErrors = Object.entries(errors).filter(([path]) => !VISIBLE_ERROR_PATHS.has(path))

  return (
    <div className="rounded-panel border border-rule bg-surface px-4 py-4">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <NumberInput
            id="simple-currentAge"
            label="지금 나이"
            value={input.basic.currentAge}
            min={19}
            max={80}
            error={errors['basic.currentAge']}
            onChange={(currentAge) => patch({ basic: { currentAge } })}
          />
          <NumberInput
            id="simple-retirementAge"
            label="은퇴하고 싶은 나이"
            value={input.basic.retirementAge}
            min={20}
            max={85}
            error={errors['basic.retirementAge']}
            onChange={(retirementAge) => patch({ basic: { retirementAge } })}
          />
        </div>

        <MoneyInput
          id="simple-initialBalance"
          label="지금까지 모은 돈"
          value={totalSavings}
          presets={SAVINGS_PRESETS}
          help="예금·주식·ETF 등 은퇴 자금으로 쓸 돈의 합계입니다."
          onChange={(total) =>
            patch({ accounts: { initialBalances: spreadTotal(input.accounts.initialBalances, total) } })
          }
        />

        {/*
          계좌를 나누지 않으면 전액 일반계좌로 계산된다 (spreadTotal 주석 참고).
          연금저축·ISA에 이미 목돈이 있는 사용자는 세금이 과다 계산되므로,
          간단 모드를 벗어나지 않고도 나눌 수 있는 경로를 여기서 제공한다.
        */}
        <Disclosure title="계좌별로 나눠 입력하기" defaultOpen={splitInitiallyOpen}>
          <p className="text-micro text-ink-muted">
            나누지 않으면 전액 일반계좌로 계산합니다. 연금저축·ISA에 이미 돈이 있다면 여기서
            옮겨주세요 — 세금이 실제보다 많이 잡혀 결과가 낮게 나옵니다.
          </p>
          {ACCOUNT_TYPES.map((account) => (
            <MoneyInput
              key={account}
              id={`simple-initial-${account}`}
              label={ACCOUNT_LABELS[account]}
              value={input.accounts.initialBalances[account]}
              onChange={(value) => patch({ accounts: { initialBalances: { [account]: value } } })}
            />
          ))}
          <p className="text-micro text-ink-muted numeric">합계 {formatKRW(totalSavings)}</p>
        </Disclosure>

        <Disclosure title="빚이 있나요?" defaultOpen={input.debt.principal > 0}>
          <DebtFields idPrefix="simple" />
        </Disclosure>

        <MoneyInput
          id="simple-monthlyContribution"
          label="매달 투자할 돈"
          value={input.accounts.monthlyContribution}
          presets={MONEY_PRESETS}
          error={errors['accounts.monthlyContribution']}
          help="연금저축·IRP·ISA·일반계좌에 세금 혜택이 큰 순서로 자동 배분됩니다."
          onChange={(monthlyContribution) => patch({ accounts: { monthlyContribution } })}
        />

        <MoneyInput
          id="simple-targetMonthlySpend"
          label="은퇴 후 매달 쓰고 싶은 돈"
          value={input.retirement.targetMonthlySpendToday}
          presets={MONEY_PRESETS}
          error={errors['retirement.targetMonthlySpendToday']}
          help="오늘 물가 기준입니다. 은퇴 시점의 실제 금액은 결과에서 확인할 수 있습니다."
          onChange={(targetMonthlySpendToday) => patch({ retirement: { targetMonthlySpendToday } })}
        />

        {hiddenErrors.length > 0 && (
          <Callout tone="warning">
            <p>{describeErrors(Object.fromEntries(hiddenErrors))[0]}</p>
            <button
              type="button"
              onClick={onSwitchToDetailed}
              className="mt-1 font-medium text-accent-ink underline decoration-accent/30 underline-offset-2 transition-colors hover:decoration-accent"
            >
              자세히 모드에서 고치기
            </button>
          </Callout>
        )}

        <Segmented
          label="은퇴 후 자산에서 매년 꺼내 쓸 비율"
          value={withdrawalKey}
          options={[
            ...WITHDRAWAL_PRESETS.map((p) => ({
              value: p.key as WithdrawalKey,
              label: p.label,
              help: `연 ${(p.rate * 100).toFixed(1)}% — ${p.hint}`,
            })),
            ...(withdrawalKey === 'custom'
              ? [
                  {
                    value: 'custom' as WithdrawalKey,
                    label: `직접 ${formatPercent(input.retirement.withdrawalRate, 1)}`,
                    help: '자세히 모드에서 지정한 값입니다',
                  },
                ]
              : []),
          ]}
          help="많이 꺼낼수록 매달 쓸 수 있는 돈은 늘지만 자산이 일찍 바닥납니다. 이 선택 하나로 필요한 은퇴자산이 30% 넘게 달라집니다."
          hint={
            withdrawalKey === 'custom'
              ? undefined
              : WITHDRAWAL_PRESETS.find((p) => p.key === withdrawalKey)?.hint
          }
          onChange={(key) => {
            const preset = WITHDRAWAL_PRESETS.find((p) => p.key === key)
            if (preset) patch({ retirement: { withdrawalRate: preset.rate } })
          }}
        />

        {/* R-8: 간단 모드에서도 숨긴 가정을 감추지 않는다 */}
        <Callout>
          <p>나머지는 아래 가정을 씁니다. 그대로 두어도 됩니다.</p>
          <p className="mt-1 numeric">
            수익률 연 {formatPercent(normalized.totalReturn)} · 물가 연{' '}
            {formatPercent(input.returns.inflation)} · ETF 수수료 연 {formatPercent(input.returns.ter)} ·{' '}
            {input.basic.endAge}세까지 사용 · 국민연금 미반영
          </p>
          <Button className="mt-2" onClick={onSwitchToDetailed}>
            자세히 설정에서 바꾸기
          </Button>
        </Callout>
      </div>
    </div>
  )
}
