import { Suspense, lazy, type ComponentProps } from 'react'

/**
 * 차트는 지연 로딩한다 (design/06-architecture.md §5).
 * Recharts 가 gzip 116KB 로 번들의 절반을 차지하므로 초기 로드에서 분리한다.
 * 핵심 지표는 차트 없이도 즉시 보이므로 사용자 체감 손실이 없다.
 */

const AssetGrowthChartImpl = lazy(() =>
  import('./AssetGrowthChart').then((m) => ({ default: m.AssetGrowthChart })),
)
const FanChartImpl = lazy(() => import('./FanChart').then((m) => ({ default: m.FanChart })))

function ChartSkeleton({ height }: { height: string }) {
  return (
    <div
      className={`w-full animate-pulse rounded-control bg-surface-sunken ${height}`}
      role="status"
      aria-label="그래프를 불러오는 중"
    />
  )
}

export function AssetGrowthChart(props: ComponentProps<typeof AssetGrowthChartImpl>) {
  return (
    <Suspense fallback={<ChartSkeleton height="h-72 sm:h-96" />}>
      <AssetGrowthChartImpl {...props} />
    </Suspense>
  )
}

export function FanChart(props: ComponentProps<typeof FanChartImpl>) {
  return (
    <Suspense fallback={<ChartSkeleton height="h-72 sm:h-80" />}>
      <FanChartImpl {...props} />
    </Suspense>
  )
}
