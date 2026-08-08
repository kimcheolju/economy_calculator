/// <reference lib="webworker" />
/**
 * Monte Carlo Web Worker (ADR-5, design/06-architecture.md §4)
 *
 * 메인 스레드를 블로킹하지 않고 10,000회 시뮬레이션을 돌린다.
 * TaxRuleSet 은 순수 데이터이므로 구조화 복제로 그대로 전달할 수 있다.
 */

import { runMonteCarlo } from '@/calc/montecarlo'
import type { CalculatorInput, MonteCarloResult } from '@/calc/types'
import type { TaxRuleSet } from '@/data/tax/types'

export type WorkerRequest =
  | { type: 'run'; input: CalculatorInput; rules: TaxRuleSet }
  | { type: 'cancel' }

export type WorkerResponse =
  | { type: 'progress'; completed: number; total: number }
  | { type: 'done'; result: MonteCarloResult }
  | { type: 'error'; message: string }

let cancelled = false

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data

  if (request.type === 'cancel') {
    cancelled = true
    return
  }

  cancelled = false

  try {
    const result = runMonteCarlo(request.input, request.rules, {
      onProgress: (completed, total) => {
        const message: WorkerResponse = { type: 'progress', completed, total }
        self.postMessage(message)
      },
      isCancelled: () => cancelled,
      progressIntervalTrials: 250,
    })
    const message: WorkerResponse = { type: 'done', result }
    self.postMessage(message)
  } catch (error) {
    const message: WorkerResponse = {
      type: 'error',
      message: error instanceof Error ? error.message : '알 수 없는 오류',
    }
    self.postMessage(message)
  }
}
