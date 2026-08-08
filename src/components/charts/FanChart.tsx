import { useMemo } from 'react'
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
import type { MonteCarloResult } from '@/calc/types'
import { formatKRW } from '@/lib/format'
import {
  ChartCaption,
  ChartTooltip,
  axisProps,
  cursorProps,
  gridProps,
  referenceLabelStyle,
  yAxisProps,
} from './ChartChrome'

/**
 * Monte Carlo 팬 차트 (design/05-ui-ux.md §4)
 * 10~90 백분위를 밴드로, 중위값을 실선으로 그린다.
 *
 * 밴드는 신뢰구간이라는 하나의 크기를 나타내므로 단일 색조의 농도 차이로만
 * 표현한다 (dataviz — sequential = one hue). 여러 색을 쓰면 각 밴드가 서로
 * 다른 종류의 값처럼 읽힌다.
 */
export function FanChart({ result, retirementAge }: { result: MonteCarloResult; retirementAge: number }) {
  const data = useMemo(
    () =>
      result.percentilePaths.p50.map((_, index) => {
        const p10 = result.percentilePaths.p10[index] ?? 0
        const p25 = result.percentilePaths.p25[index] ?? 0
        const p75 = result.percentilePaths.p75[index] ?? 0
        const p90 = result.percentilePaths.p90[index] ?? 0
        return {
          age: result.pathAges[index] ?? 0,
          p10,
          band2575: Math.max(0, p75 - p25),
          band1090Lower: Math.max(0, p25 - p10),
          band1090Upper: Math.max(0, p90 - p75),
          p50: result.percentilePaths.p50[index] ?? 0,
          // 툴팁에는 누적 밴드 두께가 아니라 실제 백분위 값을 보여준다
          p25,
          p75,
          p90,
        }
      }),
    [result],
  )

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-micro text-ink-secondary">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-4 shrink-0 rounded-[2px] bg-series-1/35" />
          25~75%
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-4 shrink-0 rounded-[2px] bg-series-1/15" />
          10~90%
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 shrink-0 rounded-full bg-ink" />
          중위값
        </span>
      </div>

      <div
        className="h-72 w-full sm:h-80"
        role="img"
        aria-label={`Monte Carlo 시뮬레이션 백분위 경로. 성공확률 ${(result.successRate * 100).toFixed(1)}%.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
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
              content={<ChartTooltip format={formatKRW} include={['p90', 'p75', 'p50', 'p25', 'p10']} />}
            />

            {/* 누적 영역으로 밴드를 만든다: p10 → p25 → p75 → p90 */}
            <Area dataKey="p10" stackId="fan" stroke="none" fill="none" name="하위 10%" />
            <Area
              dataKey="band1090Lower"
              stackId="fan"
              stroke="none"
              fill="var(--series-1)"
              fillOpacity={0.15}
              name="10~25%"
              activeDot={false}
            />
            <Area
              dataKey="band2575"
              stackId="fan"
              stroke="none"
              fill="var(--series-1)"
              fillOpacity={0.35}
              name="25~75%"
              activeDot={false}
            />
            <Area
              dataKey="band1090Upper"
              stackId="fan"
              stroke="none"
              fill="var(--series-1)"
              fillOpacity={0.15}
              name="75~90%"
              activeDot={false}
            />
            <Line
              type="monotone"
              dataKey="p50"
              name="중위값"
              stroke="var(--ink)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: 'var(--ink)', stroke: 'var(--surface)', strokeWidth: 2 }}
            />
            {/* 툴팁 전용 — 선은 그리지 않고 백분위 실제 값만 싣는다 */}
            <Line dataKey="p25" name="하위 25%" stroke="none" dot={false} activeDot={false} legendType="none" />
            <Line dataKey="p75" name="상위 25%" stroke="none" dot={false} activeDot={false} legendType="none" />
            <Line dataKey="p90" name="상위 10%" stroke="none" dot={false} activeDot={false} legendType="none" />

            <ReferenceLine
              x={retirementAge}
              stroke="var(--rule-strong)"
              strokeDasharray="4 3"
              label={{ value: `은퇴 ${retirementAge}세`, position: 'insideTopRight', ...referenceLabelStyle }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <ChartCaption>
        밴드는 시뮬레이션 경로의 백분위 구간입니다. 농도가 짙을수록 중앙에 가까운 구간이며, 실선은 중위값입니다.
      </ChartCaption>
    </div>
  )
}
