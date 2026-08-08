import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CalculationResult, MonteCarloResult } from '@/calc/types'
import type { WorkerRequest, WorkerResponse } from '@/workers/montecarlo.worker'
import { FanChart } from '@/components/charts/LazyCharts'
import { Alert } from '@/components/display/Icon'
import { Button, Label, Section } from '@/components/display/Primitives'
import { formatKRW, formatPercent } from '@/lib/format'
import { useCalculatorStore } from '@/store/calculator'
import { useRuleSet } from '@/store/useResult'
import { spawnMonteCarloWorker } from '@/workers/spawn'

/** 유휴 30초 후 워커를 종료한다 (design/06-architecture.md §4) */
const IDLE_TIMEOUT_MS = 30_000

/**
 * Monte Carlo + SORR 패널 (원안 127·129행)
 *
 * 은퇴 후에는 투자 초기에 큰 하락장이 발생하는 Sequence of Returns Risk가 매우 중요하다.
 * 같은 평균 수익률이라도 하락장이 먼저 오면 결과가 크게 악화된다.
 */
export function MonteCarloPanel({ result }: { result: CalculationResult }) {
  const input = useCalculatorStore((s) => s.input)
  const rules = useRuleSet()

  const [mcResult, setMcResult] = useState<MonteCarloResult | null>(null)
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const workerRef = useRef<Worker | null>(null)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const terminate = useCallback(() => {
    workerRef.current?.terminate()
    workerRef.current = null
  }, [])

  useEffect(() => terminate, [terminate])

  const run = useCallback(() => {
    setError(null)
    setProgress({ completed: 0, total: input.options.monteCarlo.trials })

    if (idleTimerRef.current !== undefined) clearTimeout(idleTimerRef.current)

    if (!workerRef.current) {
      workerRef.current = spawnMonteCarloWorker()
    }
    const worker = workerRef.current

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data
      if (message.type === 'progress') {
        setProgress({ completed: message.completed, total: message.total })
      } else if (message.type === 'done') {
        setMcResult(message.result)
        setProgress(null)
        idleTimerRef.current = setTimeout(terminate, IDLE_TIMEOUT_MS)
      } else {
        setError(message.message)
        setProgress(null)
      }
    }
    worker.onerror = () => {
      setError('Monte Carlo 실행 중 오류가 발생했습니다.')
      setProgress(null)
    }

    const request: WorkerRequest = { type: 'run', input, rules }
    worker.postMessage(request)
  }, [input, rules, terminate])

  function cancel() {
    const request: WorkerRequest = { type: 'cancel' }
    workerRef.current?.postMessage(request)
  }

  const deterministicDepletion = result.withdrawal.depletionAge

  // 막대 높이의 기준이 되는 최댓값. 렌더마다 전체를 다시 훑지 않도록 한 번만 구한다.
  const histogramMax = useMemo(
    () => Math.max(1, ...(mcResult?.depletionAgeHistogram.map((b) => b.count) ?? [])),
    [mcResult],
  )

  return (
    <Section title="Monte Carlo 시뮬레이션 및 서열수익률 위험(SORR)">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={run} disabled={progress !== null}>
          {mcResult ? '다시 실행' : `${input.options.monteCarlo.trials.toLocaleString('ko-KR')}회 실행`}
        </Button>

        {progress !== null && (
          <>
            <div
              className="h-1.5 w-40 overflow-hidden rounded-full bg-surface-sunken"
              role="progressbar"
              aria-valuenow={progress.completed}
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-label="Monte Carlo 진행률"
            >
              <div
                className="h-full rounded-full bg-accent transition-[width]"
                style={{ width: `${(progress.completed / Math.max(1, progress.total)) * 100}%` }}
              />
            </div>
            <span className="text-micro text-ink-muted numeric">
              {progress.completed.toLocaleString('ko-KR')} / {progress.total.toLocaleString('ko-KR')}
            </span>
            <Button onClick={cancel}>취소</Button>
          </>
        )}

        <span className="text-micro text-ink-muted numeric">
          변동성 σ {formatPercent(input.returns.volatility, 1)} · 시드 {input.options.monteCarlo.seed}
        </span>
      </div>

      {error && (
        <p className="flex items-start gap-2 rounded-control bg-critical/12 px-3 py-2 text-caption text-ink">
          <Alert className="mt-px size-3.5 shrink-0 text-critical" />
          <span>{error}</span>
        </p>
      )}

      {!mcResult && progress === null && !error && (
        <p className="text-caption text-ink-muted">
          변동성을 반영한 수익률 경로를 반복 생성해 성공확률과 자산 고갈 분포를 계산합니다. 같은 시드는 항상 같은 결과를
          냅니다.
        </p>
      )}

      {mcResult && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-control bg-rule sm:grid-cols-4">
            <Stat
              label="성공확률"
              value={formatPercent(mcResult.successRate, 1)}
              note={`${mcResult.trials.toLocaleString('ko-KR')}회 시행`}
            />
            <Stat
              label="중위 월 사용액 (오늘가치)"
              value={formatKRW(mcResult.medianFirstYearNetReal, 'compact')}
              note={`결정론적 계산 ${formatKRW(result.withdrawal.firstYearMonthlyNet.real, 'compact')}`}
            />
            <Stat
              label="중위 최종 잔여자산"
              value={formatKRW(mcResult.medianFinalBalance, 'compact')}
              note={`${input.basic.endAge}세 시점`}
            />
            <Stat
              label="중위 고갈 나이"
              value={
                mcResult.sorr.overallMedianDepletionAge === null
                  ? '고갈 없음'
                  : `${Math.round(mcResult.sorr.overallMedianDepletionAge)}세`
              }
              note={deterministicDepletion === null ? '결정론적: 고갈 없음' : `결정론적: ${deterministicDepletion}세`}
            />
          </div>

          <FanChart result={mcResult} retirementAge={input.basic.retirementAge} />

          <div className="rounded-panel bg-warning/12 p-3.5">
            <p className="flex items-center gap-1.5 text-caption font-semibold text-ink">
              <Alert className="size-4 text-warning" />
              서열수익률 위험 (Sequence of Returns Risk)
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-4">
              <div>
                <dt className="text-caption text-ink-secondary">하위 10% 경로 성공확률</dt>
                <dd className="mt-0.5 text-metric font-semibold text-ink numeric">
                  {formatPercent(mcResult.sorr.worstSequenceSuccessRate, 1)}
                </dd>
              </div>
              <div>
                <dt className="text-caption text-ink-secondary">하위 10% 경로 중위 고갈 나이</dt>
                <dd className="mt-0.5 text-metric font-semibold text-ink numeric">
                  {mcResult.sorr.worstSequenceMedianDepletionAge === null
                    ? '고갈 없음'
                    : `${Math.round(mcResult.sorr.worstSequenceMedianDepletionAge)}세`}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-caption text-ink-secondary">{mcResult.sorr.note}</p>
          </div>

          {mcResult.depletionAgeHistogram.length > 0 && (
            <div>
              <Label>자산 고갈 나이 분포</Label>
              <div className="table-scroll mt-2">
                {/* 인접 막대 사이에 2px 표면 간격을 둔다 (dataviz mark spec) */}
                <div className="flex min-w-[400px] items-end gap-0.5" style={{ height: 80 }}>
                  {mcResult.depletionAgeHistogram.map((bucket) => (
                    <div
                      key={bucket.age}
                      className="min-h-px flex-1 rounded-t-[3px] bg-series-2"
                      style={{ height: `${(bucket.count / histogramMax) * 100}%` }}
                      title={`${bucket.age}세: ${bucket.count}회`}
                    />
                  ))}
                </div>
                <div className="mt-1 flex min-w-[400px] justify-between text-micro text-ink-muted numeric">
                  <span>{mcResult.depletionAgeHistogram[0]?.age}세</span>
                  <span>{mcResult.depletionAgeHistogram[mcResult.depletionAgeHistogram.length - 1]?.age}세</span>
                </div>
              </div>
            </div>
          )}

          <p className="border-t border-rule pt-3 text-micro text-ink-muted">
            로그정규 분포(중위값 = 입력 수익률)를 사용합니다. 축적기와 인출기의 기대수익률을 각각 적용하되 변동성은
            동일하게 적용하는 단순화가 있습니다.
            {input.options.monteCarlo.annualApprox && ' 축적기를 연 단위로 근사해 속도를 높였습니다 (정확도 소폭 손실).'}
          </p>
        </div>
      )}
    </Section>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="bg-surface p-3">
      <p className="text-micro text-ink-muted">{label}</p>
      <p className="mt-1 text-title font-semibold text-ink numeric">{value}</p>
      {note && <p className="mt-0.5 text-micro text-ink-muted">{note}</p>}
    </div>
  )
}
