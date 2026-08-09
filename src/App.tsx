import { useEffect } from 'react'
import { AssetGrowthChart } from '@/components/charts/LazyCharts'
import { Callout, Panel } from '@/components/display/Primitives'
import { AssumptionsPanel, WarningList } from '@/features/assumptions-panel/AssumptionsPanel'
import { InputPanel } from '@/features/input-panel/InputPanel'
import { Header } from '@/features/layout/Header'
import { MonteCarloPanel } from '@/features/monte-carlo/MonteCarloPanel'
import { ResultDashboard } from '@/features/result-dashboard/ResultDashboard'
import { ScenarioCompare } from '@/features/scenario-compare/ScenarioCompare'
import { SolverPanel } from '@/features/solver/SolverPanel'
import { FireTable } from '@/features/withdrawal-table/FireTable'
import { PhaseTable } from '@/features/withdrawal-table/PhaseTable'
import { YearlyDetail } from '@/features/yearly-detail/YearlyDetail'
import { formatKRW } from '@/lib/format'
import { describeErrors } from '@/lib/schema'
import { hydrateStore, useCalculatorStore } from '@/store/calculator'
import { useResult, useRuleSet } from '@/store/useResult'

export default function App() {
  const loadNotice = useCalculatorStore((s) => s.loadNotice)
  const dismissNotice = useCalculatorStore((s) => s.dismissNotice)
  const validationErrors = useCalculatorStore((s) => s.validationErrors)
  const { result, isStale, hasErrors } = useResult()
  const rules = useRuleSet()

  useEffect(() => {
    void hydrateStore(window.location.search)
  }, [])

  const userRateRow = result?.fire.comparison.find(
    (row) => row.rate !== null && Math.abs(row.rate - result.input.retirement.withdrawalRate) < 1e-9,
  )

  return (
    <div className="min-h-screen">
      <Header result={result} />

      {loadNotice && (
        <div className="mx-auto max-w-7xl px-4 pt-3 sm:px-6">
          <Callout onDismiss={dismissNotice}>{loadNotice}</Callout>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:flex lg:gap-6">
        {/* 모바일: 결과 요약 sticky 바 — 슬라이더를 움직이며 숫자가 변하는 것을 즉시 본다 */}
        {result && (
          <div className="sticky top-14 z-20 -mx-4 mb-4 border-b border-rule bg-plane/90 px-4 py-2.5 backdrop-blur-md lg:hidden">
            <div className="flex items-baseline justify-between gap-3">
              {/* 히어로와 같은 말을 써야 한다 — 같은 값을 다르게 부르면 다른 지표로 읽힌다 */}
              <p className="text-micro text-ink-muted">지금 계획대로면 매달 · 오늘 가치</p>
              <p className="text-micro text-ink-muted numeric">
                목표의 {(result.fire.achievementBySpend * 100).toFixed(0)}%
              </p>
            </div>
            <p
              className="text-metric font-semibold tracking-tight text-accent-ink numeric"
              aria-live="polite"
            >
              {formatKRW(result.withdrawal.firstYearMonthlyNet.real)}
            </p>
          </div>
        )}

        {/* 입력 */}
        <aside className="lg:w-[368px] lg:shrink-0">
          <div className="lg:sticky lg:top-[72px] lg:max-h-[calc(100vh-88px)] lg:overflow-y-auto lg:pr-1">
            <InputPanel result={result} />
          </div>
        </aside>

        {/* 결과 */}
        <div className="mt-5 min-w-0 flex-1 space-y-3 lg:mt-0">
          {isStale && (
            <Callout tone="warning">
              <p>아래 입력을 고쳐주세요. 그때까지 마지막으로 유효했던 결과를 보여줍니다.</p>
              <ul className="mt-1 space-y-0.5">
                {describeErrors(validationErrors).map((text) => (
                  <li key={text}>· {text}</li>
                ))}
              </ul>
            </Callout>
          )}

          {!result && hasErrors && (
            <Panel>
              <p className="text-body text-ink-secondary">
                입력값을 확인해 주세요. 왼쪽 패널에 오류가 표시됩니다.
              </p>
            </Panel>
          )}

          {result && (
            <>
              <ResultDashboard result={result} />

              <Panel title="자산 성장 그래프">
                <AssetGrowthChart result={result} requiredAssets={userRateRow?.requiredAssets.nominal} />
              </Panel>

              <WarningList warnings={result.warnings} />

              <FireTable result={result} />
              <PhaseTable result={result} />

              <SolverPanel />
              <ScenarioCompare />
              <MonteCarloPanel result={result} />

              <YearlyDetail result={result} />
              <AssumptionsPanel result={result} />
            </>
          )}
        </div>
      </main>

      <footer className="mt-4 border-t border-rule bg-surface px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-7xl space-y-1.5 text-caption text-ink-muted">
          <p>
            이 계산기는 정보 제공 목적이며 <strong className="font-semibold text-ink-secondary">투자 권유가 아닙니다</strong>.
            세금·연금·건강보험료 계산은 참고용 근사이며 실제 금액과 다를 수 있습니다.
          </p>
          <p>
            입력한 정보는 <strong className="font-semibold text-ink-secondary">브라우저를 벗어나지 않습니다</strong>. 서버로
            전송되지 않으며 저장은 이 기기에만 이루어집니다.
          </p>
          <p className="numeric">
            세제 기준일 {rules.lastReviewed} ({rules.label}) · 빌드 {__BUILD_DATE__} · 룰셋 {__TAX_RULESET_ID__}
          </p>
        </div>
      </footer>
    </div>
  )
}
