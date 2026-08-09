import type { CalculationResult } from '@/calc/types'
import { netNominalReturn, realReturn } from '@/calc/rates'
import { Alert } from '@/components/display/Icon'
import {
  Button,
  FormulaPopover,
  Gauge,
  HeroMetric,
  Label,
  Metric,
  Panel,
  SeriesKey,
  SplitBar,
} from '@/components/display/Primitives'
import { formatAchievement, formatKRW, formatPercent } from '@/lib/format'
import { useCalculatorStore } from '@/store/calculator'
import { useRequiredContribution } from '@/store/useResult'

/**
 * 핵심 지표 (design/05-ui-ux.md §3)
 *
 * 순서는 고정이다. 사용자가 가장 먼저 알고 싶은 것은
 * "몇 억이 된다"가 아니라 "오늘 돈 가치로 매달 얼마를 쓸 수 있는가"다.
 *
 * 시각적으로도 그 순서를 강제한다 — 1순위 값만 히어로 크기를 쓰고,
 * 2~4순위는 하나의 패널 안에서 hairline 으로만 나뉜 동등한 무게로 둔다.
 * 넷을 각각 테두리 있는 카드로 만들면 위계가 사라진다.
 */
/**
 * 목표 생활비를 채우는 데 필요한 월 납입액.
 *
 * 표시·적용 금액은 만원 단위로 **올림**한다. formatKRW 는 버림이라
 * 2,449,417원을 "244만원"으로 보여주는데, 그 금액을 그대로 넣으면 목표에 미달한다.
 */
function RequiredContribution({
  targetMonthlySpendToday,
  currentMonthlyContribution,
}: {
  targetMonthlySpendToday: number
  currentMonthlyContribution: number
}) {
  const required = useRequiredContribution()
  const patch = useCalculatorStore((s) => s.patch)

  if (!required) return null

  const exact = required.value
  const rounded = exact === null ? null : Math.ceil(exact / 10_000) * 10_000
  const diff = rounded === null ? 0 : rounded - currentMonthlyContribution

  return (
    <section className="rounded-panel border border-rule bg-surface px-5 py-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <Label>
            목표 월 <span className="numeric">{formatKRW(targetMonthlySpendToday)}</span>을 채우려면
          </Label>

          {rounded === null ? (
            <p className="mt-1.5 text-title font-semibold text-ink">계산 범위 안에서는 달성할 수 없습니다</p>
          ) : rounded === 0 ? (
            <p className="mt-1.5 text-title font-semibold text-ink">추가 납입 없이도 목표를 넘습니다</p>
          ) : (
            <>
              <p className="mt-1.5 text-metric font-semibold text-ink numeric">
                매달 {formatKRW(rounded)}
              </p>
              <p className="mt-1 text-caption text-ink-muted">
                지금 <span className="numeric">{formatKRW(currentMonthlyContribution)}</span>
                {diff > 0 && (
                  <>
                    {' · '}매달 <span className="numeric">{formatKRW(diff)}</span> 더 필요
                  </>
                )}
                {diff < 0 && (
                  <>
                    {' · '}매달 <span className="numeric">{formatKRW(-diff)}</span> 여유
                  </>
                )}
              </p>
            </>
          )}

          {required.note && (
            <p className="mt-1.5 flex items-start gap-1.5 text-caption text-ink-secondary">
              <Alert className="mt-px size-3.5 shrink-0 text-warning" />
              <span>{required.note}</span>
            </p>
          )}
        </div>

        {rounded !== null && rounded > 0 && rounded !== currentMonthlyContribution && (
          <Button onClick={() => patch({ accounts: { monthlyContribution: rounded } })}>
            이 금액으로 바꾸기
          </Button>
        )}
      </div>
    </section>
  )
}

export function ResultDashboard({ result }: { result: CalculationResult }) {
  const { input, accumulation, withdrawal, fire, normalizedReturns } = result
  const monthlyNet = withdrawal.firstYearMonthlyNet
  const firstRow = withdrawal.rows[0]
  const years = input.basic.retirementAge - input.basic.currentAge

  const monthlyTax = (firstRow?.incomeTax ?? 0) / 12
  const monthlyInsurance = (firstRow?.healthInsurance ?? 0) / 12

  const netNominal = netNominalReturn(normalizedReturns.totalReturn, input.returns.ter)
  const realExpected = realReturn(netNominal, input.returns.inflation)

  return (
    <div className="space-y-3">
      {/* ① 은퇴 후 월 사용 가능액 — 화면에서 유일하게 히어로 크기를 쓰는 값 */}
      <section className="rounded-panel border border-rule bg-surface px-5 py-5 sm:px-6 sm:py-6">
        <HeroMetric
          label="은퇴 후 매달 쓸 수 있는 돈"
          value={formatKRW(monthlyNet.real)}
          action={
            <FormulaPopover title="월 사용 가능액 계산">
              <p>인출 전략: {input.retirement.strategy}</p>
              <p>세전 인출 {formatKRW(withdrawal.firstYearMonthlyGross)} / 월</p>
              <p>+ 연금소득 {formatKRW((firstRow?.pensionIncome ?? 0) / 12)} / 월</p>
              <p>− 세금 {formatKRW(monthlyTax)} / 월</p>
              <p>− 건강보험료 {formatKRW(monthlyInsurance)} / 월</p>
              <p>= 명목 {formatKRW(monthlyNet.nominal)} / 월</p>
              <p className="pt-1">
                오늘 구매력 환산: ÷ (1 + {formatPercent(input.returns.inflation)})^{years} ={' '}
                {formatKRW(monthlyNet.real)}
              </p>
            </FormulaPopover>
          }
          sub={
            /* 세금과 건보료를 명시적으로 보여주는 것이 이 계산기의 차별점이다 (05-ui-ux.md §3) */
            <dl className="flex flex-wrap gap-x-5 gap-y-1 text-caption">
              <div className="flex gap-1.5">
                <dt className="text-ink-muted">기준</dt>
                <dd className="text-ink-secondary">오늘 구매력</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-ink-muted">명목</dt>
                <dd className="text-ink-secondary numeric">{formatKRW(monthlyNet.nominal)}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-ink-muted">세금</dt>
                <dd className="text-ink-secondary numeric">−{formatKRW(monthlyTax)}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-ink-muted">건강보험료</dt>
                <dd className="text-ink-secondary numeric">−{formatKRW(monthlyInsurance)}</dd>
              </div>
              {withdrawal.depletionAge !== null && (
                <div className="flex gap-1.5">
                  <dt className="text-ink-muted">자산 소진</dt>
                  <dd className="text-ink-secondary numeric">{withdrawal.depletionAge}세</dd>
                </div>
              )}
            </dl>
          }
        />
      </section>

      {/*
        "얼마를 받나"의 짝 — "그러려면 얼마를 넣어야 하나".
        사용자가 목표 생활비를 입력했는데 결과가 달성률로만 답하면 질문이 절반만 해결된다.
        역산 도구(접힌 섹션)에 있던 값을 여기로 끌어올린다 (design/05-ui-ux.md §3).
      */}
      <RequiredContribution
        targetMonthlySpendToday={input.retirement.targetMonthlySpendToday}
        currentMonthlyContribution={input.accounts.monthlyContribution}
      />

      {/* ②~④ 달성률 · 은퇴자산 · 원금/수익 — 테두리 대신 hairline 으로만 나눈다 */}
      <section className="grid divide-y divide-rule rounded-panel border border-rule bg-surface sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="p-4">
          <Gauge ratio={fire.achievementBySpend} label="경제적 자유 달성률" />
          <p className="mt-2.5 text-caption text-ink-muted">
            목표 월 <span className="numeric">{formatKRW(input.retirement.targetMonthlySpendToday)}</span> 대비
          </p>
          <p className="mt-0.5 text-caption text-ink-muted">
            자산 기준 <span className="numeric">{formatAchievement(fire.achievementByAsset)}</span>
          </p>
        </div>

        <div className="p-4">
          <Metric
            label="예상 은퇴자산"
            value={formatKRW(accumulation.finalBalance.nominal, 'compact')}
            sub={
              <dl className="space-y-0.5">
                <div className="flex gap-1.5">
                  <dt className="text-ink-muted">명목</dt>
                  <dd className="numeric">{formatKRW(accumulation.finalBalance.nominal)}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="text-ink-muted">오늘 가치</dt>
                  <dd className="numeric">{formatKRW(accumulation.finalBalance.real)}</dd>
                </div>
              </dl>
            }
          />
        </div>

        <div className="p-4">
          <Label>총납입원금 / 투자수익</Label>
          <p className="mt-1.5 text-metric font-semibold text-ink numeric">
            {formatKRW(accumulation.totalPrincipal, 'compact')}
            <span className="mx-1.5 font-normal text-ink-muted">/</span>
            {formatKRW(accumulation.totalGain, 'compact')}
          </p>
          <SplitBar principal={accumulation.totalPrincipal} gain={accumulation.totalGain} />
          <div className="mt-2">
            <SeriesKey
              items={[
                { color: 'bg-series-1', label: '납입원금' },
                { color: 'bg-series-2', label: '투자수익' },
              ]}
            />
          </div>
        </div>
      </section>

      {/* 주요 시점 스냅샷 (원안 30행) */}
      <Panel title="주요 시점 예상자산">
        <ol className="grid grid-cols-2 gap-px overflow-hidden rounded-control bg-rule sm:grid-cols-3 lg:grid-cols-6">
          {accumulation.milestones.map((milestone) => (
            <li key={`${milestone.yearsFromNow}-${milestone.age}`} className="bg-surface p-2.5">
              <p className="text-micro text-ink-muted numeric">
                {milestone.yearsFromNow}년 후 · {milestone.age}세
              </p>
              <p className="mt-1 text-body font-semibold text-ink numeric">
                {formatKRW(milestone.balance.nominal, 'compact')}
              </p>
              <p className="text-micro text-ink-muted numeric">
                오늘 {formatKRW(milestone.balance.real, 'compact')}
              </p>
            </li>
          ))}
        </ol>
      </Panel>

      {/* 목표 생활비의 물가 반영 (원안 49행) */}
      <Panel title="목표 생활비의 물가 반영">
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-caption text-ink-muted">오늘 기준 희망 생활비</dt>
            <dd className="mt-1 text-title font-semibold text-ink numeric">
              월 {formatKRW(input.retirement.targetMonthlySpendToday)}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-ink-muted">
              은퇴 시점({input.basic.retirementAge}세) 필요 생활비
            </dt>
            <dd className="mt-1 text-title font-semibold text-ink numeric">
              월 {formatKRW(fire.targetMonthlySpend.nominal)}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-ink-muted">은퇴 시점 연금 순소득</dt>
            <dd className="mt-1 text-title font-semibold text-ink numeric">
              월 {formatKRW(fire.annualPensionNetAtRetirement / 12)}
            </dd>
          </div>
        </dl>
        <p className="mt-4 border-t border-rule pt-3 text-caption text-ink-muted">
          물가 <span className="numeric">{formatPercent(input.returns.inflation)}</span>를{' '}
          <span className="numeric">{years}</span>년 적용한 결과입니다. 보수 차감 후 명목수익률{' '}
          <span className="numeric">{formatPercent(netNominal)}</span>, 실질 기대수익률{' '}
          <span className="numeric">{formatPercent(realExpected)}</span> 기준입니다.
        </p>
      </Panel>
    </div>
  )
}
