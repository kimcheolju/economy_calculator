import type { CalculationResult, Money } from '@/calc/types'
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
import { formatKRW, formatPercent } from '@/lib/format'
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
function GoalPlan({
  targetMonthlySpendToday,
  currentMonthlyContribution,
  requiredAssets,
  projectedAssets,
  retirementAge,
  monthlyGap,
}: {
  targetMonthlySpendToday: number
  currentMonthlyContribution: number
  requiredAssets: Money | null
  projectedAssets: Money
  retirementAge: number
  monthlyGap: number
}) {
  const required = useRequiredContribution()
  const patch = useCalculatorStore((s) => s.patch)

  if (!required) return null

  const exact = required.value
  const rounded = exact === null ? null : Math.ceil(exact / 10_000) * 10_000
  const diff = rounded === null ? 0 : rounded - currentMonthlyContribution
  const reached = monthlyGap <= 0

  return (
    <Panel
      title={
        reached
          ? '목표를 넘었습니다'
          : `목표 월 ${formatKRW(targetMonthlySpendToday)}을 채우려면`
      }
    >
      <div className="space-y-4">
        {/* 목표까지의 거리를 자산 크기로 먼저 보여준다 — 월 금액만으로는 규모가 안 잡힌다 */}
        {requiredAssets !== null && (
          <dl className="flex flex-wrap gap-x-6 gap-y-2">
            <div>
              <dt className="text-caption text-ink-muted">{retirementAge}세까지 모아야 하는 돈</dt>
              <dd className="mt-0.5 text-title font-semibold text-ink numeric">
                {formatKRW(requiredAssets.nominal, 'compact')}
                <span className="ml-1.5 text-caption font-normal text-ink-muted">
                  오늘 가치 {formatKRW(requiredAssets.real, 'compact')}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-caption text-ink-muted">지금 계획대로 모이는 돈</dt>
              <dd className="mt-0.5 text-title font-semibold text-ink numeric">
                {formatKRW(projectedAssets.nominal, 'compact')}
                <span className="ml-1.5 text-caption font-normal text-ink-muted">
                  오늘 가치 {formatKRW(projectedAssets.real, 'compact')}
                </span>
              </dd>
            </div>
          </dl>
        )}

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-rule pt-3">
          <div className="min-w-0">
            {rounded === null ? (
              <p className="text-body font-medium text-ink">
                계산 범위 안에서는 납입액만으로 목표를 채울 수 없습니다
              </p>
            ) : rounded === 0 ? (
              <p className="text-body font-medium text-ink">추가 납입 없이도 목표를 넘습니다</p>
            ) : (
              <p className="text-body text-ink">
                매달 <strong className="text-title font-semibold numeric">{formatKRW(rounded)}</strong>
                <span className="text-ink-muted">
                  {' '}
                  — 지금 <span className="numeric">{formatKRW(currentMonthlyContribution)}</span>
                  {diff > 0 && (
                    <>
                      보다 <span className="numeric">{formatKRW(diff)}</span> 더
                    </>
                  )}
                  {diff < 0 && (
                    <>
                      보다 <span className="numeric">{formatKRW(-diff)}</span> 적게
                    </>
                  )}
                </span>
              </p>
            )}
            <p className="mt-1 text-caption text-ink-muted">
              은퇴 나이를 늦추거나 수익률을 바꾸는 방법은 아래 역산 도구에 있습니다.
            </p>
          </div>

          {rounded !== null && rounded > 0 && rounded !== currentMonthlyContribution && (
            <Button
              variant="primary"
              onClick={() => patch({ accounts: { monthlyContribution: rounded } })}
            >
              이 금액으로 바꾸기
            </Button>
          )}
        </div>

        {required.note && (
          <p className="flex items-start gap-1.5 text-caption text-ink-secondary">
            <Alert className="mt-px size-3.5 shrink-0 text-warning" />
            <span>{required.note}</span>
          </p>
        )}
      </div>
    </Panel>
  )
}

export function ResultDashboard({ result }: { result: CalculationResult }) {
  const { input, accumulation, debtSettlement, withdrawal, fire, normalizedReturns } = result
  const hasDebt = debtSettlement.balanceAtRetirement > 0

  /** 사용자가 고른 인출률에 해당하는 필요 총자산 — 인출률이 달라지면 필요액도 달라진다 */
  const userRateRow = fire.comparison.find(
    (row) => row.rate !== null && Math.abs(row.rate - input.retirement.withdrawalRate) < 1e-9,
  )
  const monthlyNet = withdrawal.firstYearMonthlyNet
  const firstRow = withdrawal.rows[0]
  const years = input.basic.retirementAge - input.basic.currentAge

  const monthlyTax = (firstRow?.incomeTax ?? 0) / 12
  const monthlyInsurance = (firstRow?.healthInsurance ?? 0) / 12

  const netNominal = netNominalReturn(normalizedReturns.totalReturn, input.returns.ter)
  const realExpected = realReturn(netNominal, input.returns.inflation)

  /** 목표까지의 거리 (오늘 구매력 기준 월 금액). 양수면 부족, 음수면 여유 */
  const monthlyGap = input.retirement.targetMonthlySpendToday - monthlyNet.real

  return (
    <div className="space-y-3">
      {/* ① 은퇴 후 월 사용 가능액 — 화면에서 유일하게 히어로 크기를 쓰는 값 */}
      <section className="rounded-panel border border-rule bg-surface px-5 py-5 sm:px-6 sm:py-6">
        <HeroMetric
          label="지금 계획대로면 은퇴 후 매달 쓸 수 있는 돈"
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

      {/* ②~④ 달성률 · 은퇴자산 · 원금/수익 — 테두리 대신 hairline 으로만 나눈다 */}
      <section className="grid divide-y divide-rule rounded-panel border border-rule bg-surface sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="p-4">
          <Gauge ratio={fire.achievementBySpend} label="경제적 자유 달성률" />
          <p className="mt-2.5 text-caption text-ink-muted">
            목표 월 <span className="numeric">{formatKRW(input.retirement.targetMonthlySpendToday)}</span> 대비
          </p>
          {/* 달성률 퍼센트만으로는 크기가 안 잡힌다 — 부족액을 금액으로 함께 준다 */}
          {monthlyGap > 0 ? (
            <p className="mt-0.5 text-caption text-ink-muted">
              월 <span className="numeric">{formatKRW(monthlyGap)}</span> 부족
            </p>
          ) : (
            <p className="mt-0.5 text-caption text-ink-muted">
              월 <span className="numeric">{formatKRW(-monthlyGap)}</span> 여유
            </p>
          )}
        </div>

        <div className="p-4">
          {/*
            빚이 있으면 총자산이 아니라 순자산이 실제로 쓸 수 있는 돈이다.
            총자산만 크게 보여주면 결과를 실제보다 좋게 읽게 된다.
          */}
          <Metric
            label={hasDebt ? '예상 은퇴자산 (부채 차감 후)' : '예상 은퇴자산'}
            value={formatKRW(debtSettlement.netBalance.nominal, 'compact')}
            sub={
              <dl className="space-y-0.5">
                {hasDebt && (
                  <>
                    <div className="flex gap-1.5">
                      <dt className="text-ink-muted">총자산</dt>
                      <dd className="numeric">{formatKRW(accumulation.finalBalance.nominal)}</dd>
                    </div>
                    <div className="flex gap-1.5">
                      <dt className="text-ink-muted">− 부채 상환</dt>
                      <dd className="numeric">
                        {formatKRW(debtSettlement.paid + debtSettlement.tax)}
                        {debtSettlement.tax > 0 && (
                          <span className="text-ink-muted"> (세금 {formatKRW(debtSettlement.tax)} 포함)</span>
                        )}
                      </dd>
                    </div>
                  </>
                )}
                {!hasDebt && (
                  <div className="flex gap-1.5">
                    <dt className="text-ink-muted">명목</dt>
                    <dd className="numeric">{formatKRW(accumulation.finalBalance.nominal)}</dd>
                  </div>
                )}
                <div className="flex gap-1.5">
                  <dt className="text-ink-muted">오늘 가치</dt>
                  <dd className="numeric">{formatKRW(debtSettlement.netBalance.real)}</dd>
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

      {/*
        ⑤ 목표를 채우는 방법.
        히어로(지금 계획의 결과)와 경쟁하는 답이 아니라 ②의 차이를 메우는 처방이므로,
        ② 뒤에 두고 숫자 크기도 한 단계 낮춘다 (design/05-ui-ux.md §3).
      */}
      <GoalPlan
        targetMonthlySpendToday={input.retirement.targetMonthlySpendToday}
        currentMonthlyContribution={input.accounts.monthlyContribution}
        requiredAssets={userRateRow?.requiredAssets ?? null}
        projectedAssets={debtSettlement.netBalance}
        retirementAge={input.basic.retirementAge}
        monthlyGap={monthlyGap}
      />

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
