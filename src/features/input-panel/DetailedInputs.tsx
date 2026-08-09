/**
 * 자세히 모드 입력 (design/05-ui-ux.md §2)
 *
 * 모든 가정을 직접 조정하는 전체 입력 패널.
 * 간단 모드와 같은 CalculatorInput 을 공유하므로 전환해도 값이 유지된다.
 */

import { useMemo } from 'react'
import {
  ACCOUNT_LABELS,
  ACCOUNT_TYPES,
  ETF_LABELS,
  STRATEGY_DEFINITIONS,
  STRATEGY_LABELS,
  type AccountType,
  type CalculationResult,
} from '@/calc/types'
import { allocateYear, createLimitState } from '@/calc/allocate'
import { normalizeReturns } from '@/calc/rates'
import { NumberInput, PriorityList, Segmented, Select, Toggle } from '@/components/inputs/Controls'
import { MoneyInput } from '@/components/inputs/MoneyInput'
import { RateInput } from '@/components/inputs/RateInput'
import { External } from '@/components/display/Icon'
import { Disclosure, FieldGroup, Section } from '@/components/display/Primitives'
import { DEFAULT_RATIONALE, MONEY_PRESETS } from '@/lib/defaults'
import { formatKRW, formatPercent } from '@/lib/format'
import { useCalculatorStore } from '@/store/calculator'
import { useRuleSet } from '@/store/useResult'
import { DebtFields } from './DebtFields'
import { EventEditor } from './EventEditor'

export function DetailedInputs({ result }: { result: CalculationResult | null }) {
  const input = useCalculatorStore((s) => s.input)
  const errors = useCalculatorStore((s) => s.validationErrors)
  const patch = useCalculatorStore((s) => s.patch)
  const rules = useRuleSet()

  const normalized = useMemo(() => normalizeReturns(input.returns), [input.returns])

  /** 계좌별 실제 배분액과 한도 소진율 — 입력 옆에 실시간 표시 */
  const allocation = useMemo(() => {
    const limits = createLimitState()
    const { allocation } = allocateYear(input.accounts.monthlyContribution * 12, input.accounts, rules, limits)
    const annotations: Record<string, string> = {}
    for (const account of ACCOUNT_TYPES) {
      const monthly = allocation[account] / 12
      if (monthly > 0) annotations[account] = `월 ${formatKRW(monthly, 'compact')}`
      else annotations[account] = '—'
    }
    return annotations
  }, [input.accounts, rules])

  const returnWarning =
    normalized.totalReturn > 0.12 ? '역사적 장기 평균을 크게 상회하는 가정입니다' : undefined

  return (
    <>
      <Section title="① 기본 정보" defaultOpen>
        <div className="grid grid-cols-2 gap-3">
          <NumberInput
            id="currentAge"
            label="현재 나이"
            value={input.basic.currentAge}
            min={19}
            max={80}
            error={errors['basic.currentAge']}
            onChange={(currentAge) => patch({ basic: { currentAge } })}
          />
          <NumberInput
            id="retirementAge"
            label="은퇴 목표 나이"
            value={input.basic.retirementAge}
            min={20}
            max={85}
            error={errors['basic.retirementAge']}
            onChange={(retirementAge) => patch({ basic: { retirementAge } })}
          />
        </div>
        <NumberInput
          id="endAge"
          label="자산 사용 종료 나이"
          value={input.basic.endAge}
          min={21}
          max={110}
          error={errors['basic.endAge']}
          help={DEFAULT_RATIONALE.endAge}
          hint="기대수명이 아니라 '이 나이까지 버티면 된다'는 계획 기준입니다"
          onChange={(endAge) => patch({ basic: { endAge } })}
        />
        <Segmented
          label="총급여 구간"
          value={input.basic.salaryBracket}
          options={[
            { value: 'under55m', label: '5,500만원 이하' },
            { value: 'over55m', label: '5,500만원 초과' },
          ]}
          help="연금계좌 세액공제율을 결정합니다 (16.5% / 13.2%)"
          onChange={(salaryBracket) => patch({ basic: { salaryBracket } })}
        />
        <Segmented
          label="ISA 유형"
          value={input.basic.isaType}
          options={[
            { value: 'general', label: '일반형' },
            { value: 'lowIncome', label: '서민형' },
          ]}
          help="서민형은 비과세 한도가 두 배입니다"
          hint={`비과세 한도 ${formatKRW(
            input.basic.isaType === 'general'
              ? rules.isa.exemptGeneral.value.amount
              : rules.isa.exemptLowIncome.value.amount,
          )}`}
          onChange={(isaType) => patch({ basic: { isaType } })}
        />
      </Section>

      <Section title="② 수익률 · 물가 가정" defaultOpen>
        <Segmented
          label="수익률 입력 방식"
          value={input.returns.mode}
          options={[
            { value: 'totalReturn', label: 'Total Return', help: '총수익률 하나로 입력' },
            { value: 'split', label: '분리 입력', help: '가격상승률 + 배당수익률' },
          ]}
          onChange={(mode) =>
            patch({
              returns:
                mode === 'split'
                  ? { mode, priceReturn: normalized.priceReturn }
                  : { mode, totalReturn: normalized.totalReturn },
            })
          }
        />

        {input.returns.mode === 'totalReturn' ? (
          <RateInput
            id="totalReturn"
            label="예상 연평균 총수익률"
            value={input.returns.totalReturn}
            sliderMin={0}
            sliderMax={15}
            min={-5}
            max={20}
            error={errors['returns.totalReturn']}
            warning={returnWarning}
            help={DEFAULT_RATIONALE.totalReturn}
            onChange={(totalReturn) => patch({ returns: { totalReturn } })}
          />
        ) : (
          <RateInput
            id="priceReturn"
            label="예상 연평균 가격상승률"
            value={input.returns.priceReturn}
            sliderMin={0}
            sliderMax={15}
            min={-20}
            max={20}
            error={errors['returns.priceReturn']}
            onChange={(priceReturn) => patch({ returns: { priceReturn } })}
          />
        )}

        <RateInput
          id="dividendYield"
          label="배당수익률"
          value={input.returns.dividendYield}
          sliderMin={0}
          sliderMax={6}
          min={0}
          max={10}
          error={errors['returns.dividendYield']}
          help="일반계좌 배당 원천징수(15.4%)를 계산하려면 총수익률 중 배당 비중을 알아야 합니다"
          onChange={(dividendYield) => patch({ returns: { dividendYield } })}
        />

        <p className="rounded-control bg-surface-sunken px-2.5 py-2 text-caption text-ink-secondary">
          총수익률 <strong className="font-semibold text-ink numeric">{formatPercent(normalized.totalReturn)}</strong> ={' '}
          가격상승 <strong className="font-semibold text-ink numeric">{formatPercent(normalized.priceReturn)}</strong> +{' '}
          배당 <strong className="font-semibold text-ink numeric">{formatPercent(normalized.dividendYield)}</strong>
          <br />
          <span className="text-ink-muted">배당을 중복해서 더하지 않습니다.</span>
        </p>

        <RateInput
          id="inflation"
          label="예상 연평균 물가상승률"
          value={input.returns.inflation}
          sliderMin={0}
          sliderMax={6}
          min={0}
          max={10}
          error={errors['returns.inflation']}
          help={DEFAULT_RATIONALE.inflation}
          onChange={(inflation) => patch({ returns: { inflation } })}
        />
        <RateInput
          id="ter"
          label="ETF 연간 총보수 (TER)"
          value={input.returns.ter}
          sliderMin={0}
          sliderMax={1}
          step={0.01}
          min={0}
          max={2}
          error={errors['returns.ter']}
          help={DEFAULT_RATIONALE.ter}
          onChange={(ter) => patch({ returns: { ter } })}
        />
        <RateInput
          id="retirementReturn"
          label="은퇴 후 예상 수익률"
          value={input.returns.retirementReturn}
          sliderMin={0}
          sliderMax={10}
          min={-5}
          max={15}
          error={errors['returns.retirementReturn']}
          help={DEFAULT_RATIONALE.retirementReturn}
          onChange={(retirementReturn) => patch({ returns: { retirementReturn } })}
        />

        <Toggle
          id="reinvestDividends"
          label="배당 재투자"
          checked={input.returns.reinvestDividends}
          description="끄면 배당은 현금으로 인출되어 자산에 반영되지 않습니다"
          onChange={(reinvestDividends) => patch({ returns: { reinvestDividends } })}
        />
        <Segmented
          label="납입 시점"
          value={input.returns.contributionTiming}
          options={[
            { value: 'begin', label: '월초' },
            { value: 'end', label: '월말' },
          ]}
          help="월초 납입이 한 달치 수익만큼 유리합니다"
          onChange={(contributionTiming) => patch({ returns: { contributionTiming } })}
        />
      </Section>

      <Section title="③ 계좌 포트폴리오" defaultOpen>
        <MoneyInput
          id="monthlyContribution"
          label="월 총 추가 투자금"
          value={input.accounts.monthlyContribution}
          presets={MONEY_PRESETS}
          error={errors['accounts.monthlyContribution']}
          help="이 금액이 아래 우선순위에 따라 계좌별로 자동 배분됩니다"
          onChange={(monthlyContribution) => patch({ accounts: { monthlyContribution } })}
        />
        <RateInput
          id="contributionGrowthRate"
          label="매년 투자금 증가율"
          value={input.accounts.contributionGrowthRate}
          sliderMin={0}
          sliderMax={10}
          min={0}
          max={15}
          error={errors['accounts.contributionGrowthRate']}
          help={DEFAULT_RATIONALE.contributionGrowthRate}
          onChange={(contributionGrowthRate) => patch({ accounts: { contributionGrowthRate } })}
        />

        <PriorityList
          label="배분 우선순위"
          items={input.accounts.allocationPriority}
          labels={ACCOUNT_LABELS}
          annotations={allocation}
          help="연금계좌는 세액공제 한도까지 먼저 채워지고, ISA 다음에 추가 납입이 이어집니다. 한도를 넘는 금액은 일반계좌로 배분됩니다."
          onChange={(items) => patch({ accounts: { allocationPriority: items as AccountType[] } })}
        />

        <Select
          id="etfKind"
          label="ETF 유형"
          value={input.accounts.etfKind}
          options={(Object.keys(ETF_LABELS) as (keyof typeof ETF_LABELS)[]).map((value) => ({
            value,
            label: ETF_LABELS[value],
          }))}
          help="국내상장과 해외상장의 과세 방식이 다릅니다"
          onChange={(etfKind) => patch({ accounts: { etfKind } })}
        />

        <Toggle
          id="reinvestTaxCredit"
          label="세액공제 환급금 재투자"
          checked={input.accounts.reinvestTaxCredit}
          description="연말정산 환급액을 다음 해 납입에 가산합니다"
          onChange={(reinvestTaxCredit) => patch({ accounts: { reinvestTaxCredit } })}
        />

        <FieldGroup title="부채">
          <DebtFields idPrefix="detailed" />
        </FieldGroup>

        <Disclosure title="계좌별 현재 자산 입력">
          {ACCOUNT_TYPES.map((account) => (
            <MoneyInput
              key={account}
              id={`initial-${account}`}
              label={ACCOUNT_LABELS[account]}
              value={input.accounts.initialBalances[account]}
              onChange={(value) => patch({ accounts: { initialBalances: { [account]: value } } })}
            />
          ))}
          <RateInput
            id="retirementIncomeTaxRate"
            label="퇴직소득 실효세율"
            value={input.accounts.retirementIncomeTaxRate}
            sliderMin={0}
            sliderMax={20}
            min={0}
            max={45}
            help="DC·퇴직금 인출 시 적용됩니다. 근속연수·규모에 따른 정확한 산식 대신 실효세율로 근사합니다."
            onChange={(retirementIncomeTaxRate) => patch({ accounts: { retirementIncomeTaxRate } })}
          />
        </Disclosure>
      </Section>

      <Section title="④ 은퇴 설정" defaultOpen>
        <MoneyInput
          id="targetMonthlySpend"
          label="희망 월 생활비 (현재 기준)"
          value={input.retirement.targetMonthlySpendToday}
          presets={MONEY_PRESETS}
          error={errors['retirement.targetMonthlySpendToday']}
          help="오늘 구매력 기준입니다. 은퇴 시점의 물가를 반영한 금액은 결과에서 확인할 수 있습니다."
          onChange={(targetMonthlySpendToday) => patch({ retirement: { targetMonthlySpendToday } })}
        />

        <Select
          id="strategy"
          label="인출 전략"
          value={input.retirement.strategy}
          options={(Object.keys(STRATEGY_LABELS) as (keyof typeof STRATEGY_LABELS)[]).map((value) => ({
            value,
            label: STRATEGY_LABELS[value],
          }))}
          hint={STRATEGY_DEFINITIONS[input.retirement.strategy]}
          onChange={(strategy) => patch({ retirement: { strategy } })}
        />

        <RateInput
          id="withdrawalRate"
          label="안전인출률"
          value={input.retirement.withdrawalRate}
          sliderMin={2}
          sliderMax={6}
          step={0.1}
          min={0.5}
          max={10}
          error={errors['retirement.withdrawalRate']}
          help={DEFAULT_RATIONALE.withdrawalRate}
          onChange={(withdrawalRate) => patch({ retirement: { withdrawalRate } })}
        />

        <PriorityList
          label="인출 우선순위"
          items={input.retirement.withdrawalPriority}
          labels={ACCOUNT_LABELS}
          help="과세이연 혜택이 큰 계좌를 늦게 소진하는 것이 기본값입니다. 55세 이전에는 연금계좌를 인출할 수 없습니다."
          onChange={(items) => patch({ retirement: { withdrawalPriority: items as AccountType[] } })}
        />

        <FieldGroup title="국민연금">
          <MoneyInput
            id="nationalPension"
            label="예상 월 수령액 (현재가치)"
            value={input.retirement.nationalPension.monthlyAmountToday}
            help="국민연금공단 '내 연금 알아보기'에서 조회한 금액을 입력하세요"
            onChange={(monthlyAmountToday) =>
              patch({ retirement: { nationalPension: { monthlyAmountToday } } })
            }
          />
          <a
            href="https://www.nps.or.kr/jsppage/app/mobile_web/main.jsp"
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-caption text-accent-ink underline decoration-accent/30 underline-offset-2 transition-colors hover:decoration-accent"
          >
            국민연금공단에서 조회하기
            <External className="size-3" />
          </a>
          <NumberInput
            id="pensionStartAge"
            label="수령 개시 나이"
            value={input.retirement.nationalPension.startAge}
            min={55}
            max={75}
            error={errors['retirement.nationalPension.startAge']}
            onChange={(startAge) => patch({ retirement: { nationalPension: { startAge } } })}
          />
          <Toggle
            id="isCompanyEstimate"
            label="공단 조회값을 그대로 입력했음"
            checked={input.retirement.nationalPension.isCompanyEstimate}
            description="켜두면 조기·연기 수령 조정을 다시 적용하지 않습니다 (이중 적용 방지)"
            onChange={(isCompanyEstimate) => patch({ retirement: { nationalPension: { isCompanyEstimate } } })}
          />
          <Toggle
            id="pensionIndexed"
            label="물가연동"
            checked={input.retirement.nationalPension.inflationIndexed}
            description="국민연금은 매년 물가변동률을 반영해 인상됩니다 (실질가치 유지)"
            onChange={(inflationIndexed) => patch({ retirement: { nationalPension: { inflationIndexed } } })}
          />
        </FieldGroup>

        <FieldGroup title="기타 연금 (개인연금보험·주택연금 등)">
          <MoneyInput
            id="otherPension"
            label="예상 월 수령액 (현재가치)"
            value={input.retirement.otherPension.monthlyAmountToday}
            onChange={(monthlyAmountToday) => patch({ retirement: { otherPension: { monthlyAmountToday } } })}
          />
          <NumberInput
            id="otherPensionStartAge"
            label="수령 개시 나이"
            value={input.retirement.otherPension.startAge}
            min={40}
            max={90}
            onChange={(startAge) => patch({ retirement: { otherPension: { startAge } } })}
          />
          <Toggle
            id="otherPensionIndexed"
            label="물가연동"
            checked={input.retirement.otherPension.inflationIndexed}
            description="정액형 사적연금은 보통 물가에 연동되지 않습니다"
            onChange={(inflationIndexed) => patch({ retirement: { otherPension: { inflationIndexed } } })}
          />
        </FieldGroup>

        <Segmented
          label="건강보험료 반영"
          value={input.retirement.healthInsurance.mode}
          options={[
            { value: 'rateApprox', label: '요율 근사' },
            { value: 'fixed', label: '정액 입력' },
            { value: 'none', label: '미반영' },
          ]}
          help="은퇴 후 지역가입자로 전환되면 소득·재산에 보험료가 부과됩니다. 재산 부과분은 모델링하지 않으므로 실제보다 과소 추정입니다."
          onChange={(mode) => patch({ retirement: { healthInsurance: { mode } } })}
        />
        {input.retirement.healthInsurance.mode === 'fixed' && (
          <MoneyInput
            id="fixedInsurance"
            label="월 건강보험료"
            value={input.retirement.healthInsurance.fixedMonthlyAmount ?? 0}
            onChange={(fixedMonthlyAmount) => patch({ retirement: { healthInsurance: { fixedMonthlyAmount } } })}
          />
        )}
      </Section>

      <Section title="⑤ 고급" badge={input.events.length > 0 ? `이벤트 ${input.events.length}건` : undefined}>
        <EventEditor />

        <RateInput
          id="scenarioReturnOffset"
          label="시나리오 수익률 오프셋"
          value={input.options.scenarioOffsets.returnOffset}
          sliderMin={0}
          sliderMax={5}
          min={0}
          max={10}
          help="보수적·낙관적 시나리오의 수익률 조정폭"
          onChange={(returnOffset) => patch({ options: { scenarioOffsets: { returnOffset } } })}
        />
        <RateInput
          id="scenarioInflationOffset"
          label="시나리오 물가 오프셋"
          value={input.options.scenarioOffsets.inflationOffset}
          sliderMin={0}
          sliderMax={2}
          step={0.1}
          min={0}
          max={5}
          help="보수적 시나리오에서 물가를 얼마나 불리하게 볼지"
          onChange={(inflationOffset) => patch({ options: { scenarioOffsets: { inflationOffset } } })}
        />
        <RateInput
          id="volatility"
          label="수익률 변동성 (σ)"
          value={input.returns.volatility}
          sliderMin={0}
          sliderMax={40}
          step={0.5}
          min={0}
          max={60}
          help={DEFAULT_RATIONALE.volatility}
          onChange={(volatility) => patch({ returns: { volatility } })}
        />
        <NumberInput
          id="mcTrials"
          label="Monte Carlo 시행 횟수"
          value={input.options.monteCarlo.trials}
          min={100}
          max={50_000}
          suffix="회"
          error={errors['options.monteCarlo.trials']}
          onChange={(trials) => patch({ options: { monteCarlo: { trials } } })}
        />
        <NumberInput
          id="mcSeed"
          label="난수 시드"
          value={input.options.monteCarlo.seed}
          suffix=""
          help="같은 시드는 항상 같은 결과를 냅니다 (재현성)"
          onChange={(seed) => patch({ options: { monteCarlo: { seed } } })}
        />
        <Toggle
          id="mcAnnualApprox"
          label="Monte Carlo 연 단위 근사"
          checked={input.options.monteCarlo.annualApprox}
          description="축적기를 연 단위로 근사해 속도를 높입니다 (정확도 소폭 손실)"
          onChange={(annualApprox) => patch({ options: { monteCarlo: { annualApprox } } })}
        />

        <Toggle
          id="applyProposed"
          label="개정안 세제 적용"
          checked={input.options.applyProposedRules}
          description="국회 통과 전 개정안(2026 세제개편안)을 적용해 비교합니다. 확정된 제도가 아닙니다."
          onChange={(applyProposedRules) => patch({ options: { applyProposedRules } })}
        />

        {result && (
          <p className="text-micro text-ink-muted numeric">
            적용 룰셋: {rules.label} · 검토 {rules.lastReviewed}
          </p>
        )}
      </Section>
    </>
  )
}
