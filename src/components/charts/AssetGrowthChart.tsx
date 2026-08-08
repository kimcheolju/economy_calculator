import { useMemo, useState } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { CalculationResult } from '@/calc/types'
import { SeriesKey } from '@/components/display/Primitives'
import { formatKRW } from '@/lib/format'
import {
  ChartCaption,
  ChartToggle,
  ChartToolbar,
  ChartTooltip,
  axisProps,
  cursorProps,
  gridProps,
  referenceLabelStyle,
  yAxisProps,
} from './ChartChrome'

/**
 * 자산 성장 그래프 (원안 149~157행, design/05-ui-ux.md §4)
 *
 * 축적기만 보여주면 "10억을 모았다"에서 끝난다.
 * 은퇴 후 자산이 어떻게 변하는지를 같은 화면에서 연결해 보여줄 때
 * 사용자가 계획의 지속성을 이해한다. 이 차트가 제품의 핵심 시각 산출물이다.
 */

interface Row {
  age: number
  /**
   * 인출기에는 원금/수익 분해가 의미를 잃으므로 null 을 넣는다.
   * 0을 넣으면 monotone 보간이 급락 구간에서 오버슈트해 톱니 형태의 허상이 생긴다.
   */
  principal: number | null
  gain: number | null
  total: number
  withdrawal: number
  phase: 'accumulation' | 'withdrawal'
}

interface Props {
  result: CalculationResult
  requiredAssets?: number
}

const BASIS_OPTIONS = [
  { value: 'nominal', label: '명목' },
  { value: 'real', label: '오늘 가치' },
] as const

export function AssetGrowthChart({ result, requiredAssets }: Props) {
  const [basis, setBasis] = useState<'nominal' | 'real'>('nominal')
  const { input, accumulation, withdrawal } = result
  const inflation = input.returns.inflation

  const data = useMemo<Row[]>(() => {
    const rows: Row[] = []

    for (const snap of accumulation.snapshots) {
      const total = basis === 'nominal' ? snap.balance.nominal : snap.balance.real
      const scale = snap.balance.nominal > 0 ? total / snap.balance.nominal : 1
      const principal = Math.min(total, snap.cumulativePrincipal * scale)
      rows.push({
        age: snap.age,
        principal,
        gain: Math.max(0, total - principal),
        total,
        withdrawal: 0,
        phase: 'accumulation',
      })
    }

    // 인출기: 원금/수익 분해는 의미가 없어지므로 총자산만 이어 그린다.
    // 은퇴 나이는 축적기 마지막 스냅샷과 겹치므로 중복 지점을 만들지 않는다.
    const lastAccumulationAge = rows[rows.length - 1]?.age
    for (const row of withdrawal.rows) {
      if (row.age === lastAccumulationAge) continue
      const total = basis === 'nominal' ? row.endingBalance.nominal : row.endingBalance.real
      rows.push({
        age: row.age,
        principal: null,
        gain: null,
        total,
        withdrawal: basis === 'nominal' ? row.netIncome.nominal : row.netIncome.real,
        phase: 'withdrawal',
      })
    }

    return rows
  }, [accumulation.snapshots, withdrawal.rows, basis])

  const target =
    requiredAssets === undefined
      ? undefined
      : basis === 'nominal'
        ? requiredAssets
        : requiredAssets / Math.pow(1 + inflation, input.basic.retirementAge - input.basic.currentAge)

  const pensionStartAge =
    input.retirement.nationalPension.monthlyAmountToday > 0
      ? input.retirement.nationalPension.startAge
      : undefined

  return (
    <div>
      <ChartToolbar
        note={
          withdrawal.depletionAge !== null && (
            <span className="text-micro text-ink-secondary [font-variant-numeric:tabular-nums]">
              {withdrawal.depletionAge}세 자산 소진
            </span>
          )
        }
      >
        <ChartToggle label="금액 기준" value={basis} options={BASIS_OPTIONS} onChange={setBasis} />
      </ChartToolbar>

      {/* 색 단독으로 계열을 구분하지 않는다 — 범례를 차트 위에 직접 둔다 */}
      <div className="mb-2">
        <SeriesKey
          items={[
            { color: 'bg-series-1', label: '누적 납입원금' },
            { color: 'bg-series-2', label: '투자수익' },
            { color: 'bg-ink', label: '총자산' },
          ]}
        />
      </div>

      <div
        className="h-72 w-full sm:h-96"
        role="img"
        aria-label={`나이별 자산 변화 그래프. ${input.basic.currentAge}세부터 ${input.basic.endAge}세까지. 은퇴 ${input.basic.retirementAge}세. 아래 연도별 상세 표에 같은 데이터가 있습니다.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            {/* 나이를 숫자 축으로 다뤄야 은퇴·연금 기준선이 정확한 위치에 놓인다 */}
            <XAxis
              {...axisProps}
              dataKey="age"
              type="number"
              domain={['dataMin', 'dataMax']}
              allowDecimals={false}
              tickFormatter={(age: number) => `${age}세`}
              minTickGap={24}
            />
            <YAxis {...yAxisProps} />
            <Tooltip
              cursor={cursorProps}
              content={
                <ChartTooltip
                  format={formatKRW}
                  include={['principal', 'gain', 'total']}
                />
              }
            />

            <Area
              type="linear"
              dataKey="principal"
              name="누적 납입원금"
              stackId="composition"
              stroke="var(--series-1)"
              strokeWidth={1}
              fill="var(--series-1)"
              fillOpacity={0.28}
              connectNulls={false}
              dot={false}
              activeDot={false}
            />
            <Area
              type="linear"
              dataKey="gain"
              name="투자수익"
              stackId="composition"
              stroke="var(--series-2)"
              strokeWidth={1}
              fill="var(--series-2)"
              fillOpacity={0.28}
              connectNulls={false}
              dot={false}
              activeDot={false}
            />
            <Line
              type="linear"
              dataKey="total"
              name="총자산"
              stroke="var(--ink)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: 'var(--ink)', stroke: 'var(--surface)', strokeWidth: 2 }}
            />

            <ReferenceLine
              x={input.basic.retirementAge}
              stroke="var(--rule-strong)"
              strokeDasharray="4 3"
              label={{
                value: `은퇴 ${input.basic.retirementAge}세`,
                position: 'insideTopRight',
                ...referenceLabelStyle,
              }}
            />
            {pensionStartAge !== undefined && (
              <ReferenceLine
                x={pensionStartAge}
                stroke="var(--series-3)"
                strokeDasharray="2 3"
                label={{
                  value: `연금 ${pensionStartAge}세`,
                  position: 'insideBottomRight',
                  ...referenceLabelStyle,
                  fill: 'var(--series-3)',
                }}
              />
            )}
            {target !== undefined && Number.isFinite(target) && (
              <ReferenceLine
                y={target}
                stroke="var(--rule-strong)"
                strokeDasharray="6 3"
                label={{ value: '목표 필요자산', position: 'insideTopLeft', ...referenceLabelStyle }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <ChartCaption>
        은퇴 이후 구간은 원금/수익 구분 없이 총자산만 표시합니다(연말 잔액 기준). 정확한 연도별 값은 아래 연도별
        상세 표에서 확인하세요.
      </ChartCaption>
    </div>
  )
}
