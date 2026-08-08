/**
 * 입력 패널 — 밀도 전환 + 두 모드 조립 (design/05-ui-ux.md §2 "입력 밀도")
 *
 * 두 모드는 같은 CalculatorInput 을 공유한다. 간단 모드에서 숨긴 값도
 * 기본값 그대로 계산에 들어가므로, 모드를 바꿔도 결과는 달라지지 않는다.
 */

import type { CalculationResult } from '@/calc/types'
import { Segmented } from '@/components/inputs/Controls'
import { useInputModeStore } from '@/store/inputMode'
import { DetailedInputs } from './DetailedInputs'
import { SimpleInputs } from './SimpleInputs'

export function InputPanel({ result }: { result: CalculationResult | null }) {
  const mode = useInputModeStore((s) => s.mode)
  const setMode = useInputModeStore((s) => s.setMode)

  return (
    <div className="space-y-2">
      <div className="rounded-panel border border-rule bg-surface px-4 py-3">
        <Segmented
          label="입력 방식"
          value={mode}
          options={[
            { value: 'simple', label: '간단', help: '꼭 필요한 5가지만 입력' },
            { value: 'detailed', label: '자세히', help: '모든 가정을 직접 조정' },
          ]}
          hint={
            mode === 'simple'
              ? '나머지는 보수적인 기본값을 씁니다. 계산 방식은 두 모드가 같습니다.'
              : '수익률·세금·연금까지 직접 조정합니다.'
          }
          onChange={setMode}
        />
      </div>

      {mode === 'simple' ? (
        <SimpleInputs onSwitchToDetailed={() => setMode('detailed')} />
      ) : (
        <DetailedInputs result={result} />
      )}
    </div>
  )
}
