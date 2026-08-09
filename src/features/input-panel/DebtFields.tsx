/**
 * 부채 입력 (design/05-ui-ux.md §2, design/02 §12)
 *
 * 간단·자세히 모드가 함께 쓴다. 빚을 빼먹으면 결과가 실제보다 좋게 나오므로,
 * 입력 옆에서 상환 완료 나이와 은퇴 시점 잔여 부채를 즉시 보여준다 —
 * 숫자를 넣어보기 전에는 "은퇴할 때 빚이 얼마나 남는지"를 아무도 모른다.
 */

import { simulateDebt } from '@/calc/debt'
import { Toggle } from '@/components/inputs/Controls'
import { MoneyInput } from '@/components/inputs/MoneyInput'
import { RateInput } from '@/components/inputs/RateInput'
import { Callout } from '@/components/display/Primitives'
import { formatKRW } from '@/lib/format'
import { useCalculatorStore } from '@/store/calculator'

export function DebtFields({ idPrefix }: { idPrefix: string }) {
  const input = useCalculatorStore((s) => s.input)
  const errors = useCalculatorStore((s) => s.validationErrors)
  const patch = useCalculatorStore((s) => s.patch)

  const { debt, basic } = input
  const result = simulateDebt(debt, basic.currentAge, basic.retirementAge, basic.endAge)
  const active = debt.principal > 0

  return (
    <div className="space-y-3">
      <MoneyInput
        id={`${idPrefix}-debtPrincipal`}
        label="남은 원금"
        value={debt.principal}
        error={errors['debt.principal']}
        help="주택담보대출·신용대출·학자금 등을 합쳐서 넣으세요. 없으면 0으로 두면 됩니다."
        onChange={(principal) => patch({ debt: { principal } })}
      />

      {active && (
        <>
          <RateInput
            id={`${idPrefix}-debtRate`}
            label="연 금리"
            value={debt.annualRate}
            sliderMin={0}
            sliderMax={10}
            step={0.1}
            min={0}
            max={30}
            error={errors['debt.annualRate']}
            onChange={(annualRate) => patch({ debt: { annualRate } })}
          />

          <MoneyInput
            id={`${idPrefix}-debtPayment`}
            label="매달 갚는 돈"
            value={debt.monthlyPayment}
            error={errors['debt.monthlyPayment']}
            help="원금과 이자를 합친 실제 상환액입니다."
            onChange={(monthlyPayment) => patch({ debt: { monthlyPayment } })}
          />

          {result.neverPaysOff ? (
            <Callout tone="warning">
              매달 갚는 돈이 월 이자{' '}
              <span className="numeric">{formatKRW((debt.principal * debt.annualRate) / 12)}</span>
              보다 적어 원금이 줄지 않습니다. 잔액이 오히려 늘어납니다.
            </Callout>
          ) : (
            <Callout>
              <p className="numeric">
                {result.payoffAge === null
                  ? `${basic.endAge}세까지도 상환이 끝나지 않습니다`
                  : `${result.payoffAge}세에 상환 완료`}
              </p>
              <p className="mt-0.5 numeric">
                은퇴({basic.retirementAge}세) 시점 잔여 부채{' '}
                {result.balanceAtRetirement > 0 ? formatKRW(result.balanceAtRetirement) : '없음'}
              </p>
              {result.balanceAtRetirement > 0 && (
                <p className="mt-1">남은 빚은 은퇴 자산에서 갚는 것으로 계산합니다.</p>
              )}
            </Callout>
          )}

          <Toggle
            id={`${idPrefix}-investFreed`}
            label="상환이 끝나면 그 돈을 투자에 보탠다"
            checked={debt.investFreedPayment}
            description={
              debt.monthlyPayment > 0
                ? `상환 완료 후 매달 ${formatKRW(debt.monthlyPayment)}을 추가로 투자합니다`
                : '상환 완료 후 상환액만큼 투자를 늘립니다'
            }
            onChange={(investFreedPayment) => patch({ debt: { investFreedPayment } })}
          />
        </>
      )}
    </div>
  )
}
