/**
 * 계산 엔진 입출력 타입 (design/04-data-model.md)
 *
 * CLAUDE.md R-1: 모든 금액은 명목/실질이 타입 또는 필드명으로 구분된다.
 * 실질(real)의 기준 시점은 항상 '계산 실행일(오늘)'이다.
 */

// ─── 열거형 ────────────────────────────────────────────────────────

export type AccountType = 'taxable' | 'isa' | 'pensionSavings' | 'irp' | 'dcRetirement'

export const ACCOUNT_TYPES: readonly AccountType[] = [
  'taxable',
  'isa',
  'pensionSavings',
  'irp',
  'dcRetirement',
]

export const ACCOUNT_LABELS: Readonly<Record<AccountType, string>> = {
  taxable: '일반계좌',
  isa: 'ISA',
  pensionSavings: '연금저축',
  irp: 'IRP',
  dcRetirement: 'DC·퇴직금',
}

export type EtfKind = 'domesticEquity' | 'domesticListedForeign' | 'foreignListed'

export const ETF_LABELS: Readonly<Record<EtfKind, string>> = {
  domesticEquity: '국내상장·국내주식형 (매매차익 비과세)',
  domesticListedForeign: '국내상장·해외/채권/파생형 (매매차익 15.4%)',
  foreignListed: '해외상장 (양도소득 22%, 연 250만원 공제)',
}

export type ReturnInputMode = 'totalReturn' | 'split'
export type ContributionTiming = 'begin' | 'end'
export type IsaType = 'general' | 'lowIncome'
export type WithdrawalStrategy = 'fixedReal' | 'fixedPercent' | 'depletion' | 'vpw'

export const STRATEGY_LABELS: Readonly<Record<WithdrawalStrategy, string>> = {
  fixedReal: '고정 실질 인출',
  fixedPercent: '고정 비율 인출 (자산 보존형)',
  depletion: '계획 소진형',
  vpw: '매년 재계산형 (VPW)',
}

export const STRATEGY_DEFINITIONS: Readonly<Record<WithdrawalStrategy, string>> = {
  fixedReal:
    '첫해에 은퇴자산 × 인출률을 인출하고, 이후 매년 물가상승률만큼 인출액을 늘립니다. 생활비가 안정적이지만 자산이 고갈될 수 있습니다.',
  fixedPercent:
    '매년 그 해 잔여자산 × 인출률을 인출합니다. 자산이 절대 고갈되지 않지만 생활비가 시장에 따라 변동합니다.',
  depletion:
    '종료 나이에 잔액이 0이 되도록 은퇴 시점에 인출액을 산정하고, 이후 물가상승률만큼 늘립니다.',
  vpw: '매년 잔여자산과 잔여기간으로 인출액을 다시 계산합니다. 시장에 반응하면서 고갈 위험이 매우 낮습니다.',
}

export type HealthInsuranceMode = 'none' | 'rateApprox' | 'fixed'
export type SalaryBracket = 'under55m' | 'over55m'

// ─── 입력 ──────────────────────────────────────────────────────────

export interface BasicInfo {
  currentAge: number
  retirementAge: number
  endAge: number
  salaryBracket: SalaryBracket
  isaType: IsaType
  birthYear?: number
}

export interface ReturnAssumptions {
  mode: ReturnInputMode
  /** mode='totalReturn' 일 때의 입력값 */
  totalReturn: number
  /** mode='split' 일 때의 입력값 */
  priceReturn: number
  /** 두 모드 모두 입력 — 일반계좌 배당 원천징수 계산에 반드시 필요 */
  dividendYield: number
  inflation: number
  ter: number
  retirementReturn: number
  reinvestDividends: boolean
  contributionTiming: ContributionTiming
  volatility: number
}

/** 두 입력 모드가 수렴하는 단일 내부 표현. 이 타입을 거치지 않은 값을 계산에 넣지 않는다. */
export interface NormalizedReturns {
  readonly priceReturn: number
  readonly dividendYield: number
  readonly totalReturn: number
}

export interface AccountPlan {
  monthlyContribution: number
  contributionGrowthRate: number
  initialBalances: Record<AccountType, number>
  allocationMode: 'auto' | 'manual'
  allocationPriority: AccountType[]
  manualAllocation?: Record<AccountType, number>
  etfKind: EtfKind
  reinvestTaxCredit: boolean
  retirementIncomeTaxRate: number
}

export interface NationalPensionPlan {
  monthlyAmountToday: number
  startAge: number
  /** true면 공단 조회값이므로 조기/연기 조정을 다시 적용하지 않는다 */
  isCompanyEstimate: boolean
  inflationIndexed: boolean
  effectiveTaxRate: number
}

export interface OtherPensionPlan {
  monthlyAmountToday: number
  startAge: number
  inflationIndexed: boolean
}

export interface RetirementPlan {
  targetMonthlySpendToday: number
  strategy: WithdrawalStrategy
  withdrawalRate: number
  withdrawalPriority: AccountType[]
  nationalPension: NationalPensionPlan
  otherPension: OtherPensionPlan
  healthInsurance: {
    mode: HealthInsuranceMode
    fixedMonthlyAmount?: number
  }
}

export interface CashflowEvent {
  id: string
  label: string
  age: number
  amount: number
  direction: 'inflow' | 'outflow'
  basis: 'real' | 'nominal'
}

export interface SimulationOptions {
  taxRuleSetId: string
  applyProposedRules: boolean
  taxOverrides?: Record<string, number>
  scenarioOffsets: { returnOffset: number; inflationOffset: number }
  monteCarlo: { trials: number; seed: number; model: 'lognormal' | 'bootstrap'; annualApprox: boolean }
}

export interface CalculatorInput {
  schemaVersion: 1
  basic: BasicInfo
  returns: ReturnAssumptions
  accounts: AccountPlan
  retirement: RetirementPlan
  events: CashflowEvent[]
  options: SimulationOptions
}

// ─── 출력 ──────────────────────────────────────────────────────────

export interface Money {
  readonly nominal: number
  /** 오늘(계산 실행일) 구매력 기준 */
  readonly real: number
}

export interface AccountState {
  balance: number
  costBasis: number
  /** 연금계좌: 세액공제를 받은 원금 (인출 시 과세 대상) */
  deductedPrincipal: number
  /** 연금계좌: 세액공제를 받지 않은 원금 (인출 시 비과세) */
  nonDeductedPrincipal: number
  totalContributed: number
  taxPaidCumulative: number
}

export interface YearSnapshot {
  readonly age: number
  readonly yearIndex: number
  readonly contribution: number
  readonly dividend: number
  readonly taxPaid: number
  readonly taxCredit: number
  readonly balance: Money
  readonly cumulativePrincipal: number
  readonly cumulativeGain: number
  readonly byAccount: Readonly<Record<AccountType, number>>
}

export interface Milestone {
  readonly yearsFromNow: number
  readonly age: number
  readonly balance: Money
}

export interface AccumulationResult {
  readonly snapshots: readonly YearSnapshot[]
  readonly finalBalance: Money
  readonly totalPrincipal: number
  readonly totalGain: number
  readonly totalTaxPaid: number
  readonly totalTaxCredit: number
  readonly totalDividendCashOut: number
  readonly finalAccounts: Readonly<Record<AccountType, AccountState>>
  readonly milestones: readonly Milestone[]
}

export interface YearlyWithdrawalRow {
  readonly age: number
  readonly phase: string
  readonly targetSpend: Money
  readonly grossWithdrawal: number
  readonly withdrawalByAccount: Readonly<Record<AccountType, number>>
  readonly pensionIncome: number
  readonly incomeTax: number
  readonly healthInsurance: number
  readonly netIncome: Money
  readonly endingBalance: Money
  readonly shortfall: number
}

export interface PhaseSummary {
  readonly name: string
  readonly fromAge: number
  readonly toAge: number
  readonly availableSources: readonly AccountType[]
  readonly avgMonthlyNet: Money
  readonly avgMonthlyPension: number
  readonly avgMonthlyWithdrawal: number
  readonly endingBalance: Money
  readonly note?: string
}

export interface WithdrawalResult {
  readonly rows: readonly YearlyWithdrawalRow[]
  readonly phases: readonly PhaseSummary[]
  readonly firstYearMonthlyGross: number
  readonly firstYearMonthlyNet: Money
  readonly depletionAge: number | null
  readonly totalTaxPaid: number
  readonly totalInsurancePaid: number
  readonly isaSettlementTax: number
}

export interface FireComparisonRow {
  readonly method: string
  readonly rate: number | null
  readonly requiredAssets: Money
  readonly monthlyWithdrawGross: number
  readonly monthlyNet: Money
  readonly isAchievable: boolean
  readonly shortfall: number
}

export interface FireResult {
  readonly targetMonthlySpend: Money
  readonly annualPensionNetAtRetirement: number
  readonly grossNeededAtRetirement: number
  readonly comparison: readonly FireComparisonRow[]
  readonly achievementBySpend: number
  readonly achievementByAsset: number
}

export interface Assumption {
  readonly label: string
  readonly value: string
  readonly derivation?: string
  readonly source?: string
  readonly asOf?: string
  readonly status?: 'confirmed' | 'proposed' | 'needs-verification' | 'approximation' | 'userOverride'
  readonly group: '수익률' | '계산 규약' | '적용 세제' | '한계'
}

export interface Warning {
  readonly code: string
  readonly severity: 'info' | 'warn' | 'error'
  readonly message: string
  readonly relatedField?: string
}

export interface CalculationResult {
  readonly input: CalculatorInput
  readonly normalizedReturns: NormalizedReturns
  readonly accumulation: AccumulationResult
  readonly withdrawal: WithdrawalResult
  readonly fire: FireResult
  readonly assumptions: readonly Assumption[]
  readonly warnings: readonly Warning[]
  readonly computedAtIso: string
}

// ─── Monte Carlo ───────────────────────────────────────────────────

export interface MonteCarloResult {
  readonly trials: number
  readonly successRate: number
  readonly percentilePaths: Readonly<Record<'p10' | 'p25' | 'p50' | 'p75' | 'p90', readonly number[]>>
  /** 각 경로 지점에 대응하는 나이. percentilePaths 와 길이가 같다. */
  readonly pathAges: readonly number[]
  readonly depletionAgeHistogram: readonly { age: number; count: number }[]
  readonly medianFinalBalance: number
  readonly medianFirstYearNetReal: number
  readonly sorr: {
    readonly worstSequenceSuccessRate: number
    readonly worstSequenceMedianDepletionAge: number | null
    readonly overallMedianDepletionAge: number | null
    readonly note: string
  }
}
