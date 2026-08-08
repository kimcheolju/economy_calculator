# 04. 데이터 모델

대응 요구사항: R1(입력 모델), R12(저장·공유)

---

## 1. 입력 타입 (`src/calc/types.ts`)

```ts
// ─── 열거형 ───────────────────────────────────────────────
export type AccountType =
  | 'taxable' | 'isa' | 'pensionSavings' | 'irp' | 'dcRetirement'

export type EtfKind =
  | 'domesticEquity' | 'domesticListedForeign' | 'foreignListed'

export type ReturnInputMode = 'totalReturn' | 'split'
export type ContributionTiming = 'begin' | 'end'
export type IsaType = 'general' | 'lowIncome'
export type WithdrawalStrategy = 'fixedReal' | 'fixedPercent' | 'depletion' | 'vpw'
export type HealthInsuranceMode = 'none' | 'rateApprox' | 'fixed'
export type SalaryBracket = 'under55m' | 'over55m'   // 연금 세액공제율 결정


// ─── 기본 정보 ────────────────────────────────────────────
export interface BasicInfo {
  currentAge: number
  retirementAge: number
  endAge: number                 // 자산 사용 종료 나이
  salaryBracket: SalaryBracket
  isaType: IsaType
  birthYear?: number             // 국민연금 기준 수급 연령 판정용 (선택)
}


// ─── 수익률·물가 가정 ─────────────────────────────────────
export interface ReturnAssumptions {
  mode: ReturnInputMode
  totalReturn: number            // 0.07  (mode='totalReturn' 일 때 입력)
  priceReturn: number            // 0.055 (mode='split' 일 때 입력, 아니면 파생)
  dividendYield: number          // 0.015 (두 모드 모두 입력)
  inflation: number              // 0.02
  ter: number                    // 0.0015
  retirementReturn: number       // 0.04
  reinvestDividends: boolean
  contributionTiming: ContributionTiming
  volatility: number             // 0.15 — Monte Carlo 전용
}

/**
 * 정규화: 두 모드를 동일한 내부 표현으로 수렴시킨다.
 * 이 함수를 거치지 않은 ReturnAssumptions 를 계산에 넣으면 안 된다.
 */
export interface NormalizedReturns {
  readonly priceReturn: number
  readonly dividendYield: number
  readonly totalReturn: number   // = priceReturn + dividendYield (항등식 보장)
}


// ─── 계좌 포트폴리오 ──────────────────────────────────────
export interface AccountPlan {
  monthlyContribution: number          // 전 계좌 합계
  contributionGrowthRate: number       // 0.03 — 연 1회 증액
  initialBalances: Record<AccountType, number>
  allocationMode: 'auto' | 'manual'
  allocationPriority: AccountType[]    // auto 모드: 우선순위
  manualAllocation?: Record<AccountType, number>  // manual 모드: 월 금액
  etfKind: EtfKind
  reinvestTaxCredit: boolean           // 세액공제 환급금 재투자
  retirementIncomeTaxRate: number      // DC/퇴직금 실효세율 (기본 0.05)
}


// ─── 은퇴 설정 ────────────────────────────────────────────
export interface RetirementPlan {
  targetMonthlySpendToday: number      // 오늘 구매력 기준
  strategy: WithdrawalStrategy
  withdrawalRate: number               // 0.035
  withdrawalPriority: AccountType[]

  nationalPension: {
    monthlyAmountToday: number         // 공단 조회값 (현재가치)
    startAge: number
    isCompanyEstimate: boolean         // true면 조기/연기 조정 재적용 안 함
    inflationIndexed: boolean          // 기본 true
    effectiveTaxRate: number           // 기본 0.03
  }

  otherPension: {
    monthlyAmountToday: number
    startAge: number
    inflationIndexed: boolean          // 기본 false
  }

  healthInsurance: {
    mode: HealthInsuranceMode          // 기본 'rateApprox'
    fixedMonthlyAmount?: number
  }
}


// ─── 일회성 현금흐름 ──────────────────────────────────────
export interface CashflowEvent {
  id: string
  label: string                        // '주택 구입', '퇴직금 수령'
  age: number
  amount: number                       // 항상 양수
  direction: 'inflow' | 'outflow'
  basis: 'real' | 'nominal'            // real이면 해당 나이 시점 명목으로 환산
}


// ─── 시뮬레이션 옵션 ──────────────────────────────────────
export interface SimulationOptions {
  taxRuleSetId: string                 // 'kr-2026'
  applyProposedRules: boolean          // 개정안 토글 (기본 false)
  taxOverrides?: Record<string, number>
  scenarioOffsets: { returnOffset: number; inflationOffset: number }  // ±0.02, +0.005
  monteCarlo: { trials: number; seed: number; model: 'lognormal' | 'bootstrap' }
}


// ─── 최종 입력 ────────────────────────────────────────────
export interface CalculatorInput {
  schemaVersion: 1                     // URL/localStorage 마이그레이션용
  basic: BasicInfo
  returns: ReturnAssumptions
  accounts: AccountPlan
  retirement: RetirementPlan
  events: CashflowEvent[]
  options: SimulationOptions
}
```

---

## 2. 출력 타입

```ts
export interface Money {
  readonly nominal: number
  readonly real: number                // 오늘 구매력 기준 (CLAUDE.md R-1)
}

export interface YearSnapshot {
  readonly age: number
  readonly yearIndex: number
  readonly contribution: number
  readonly dividend: number
  readonly taxPaid: number
  readonly balance: Money
  readonly cumulativePrincipal: number   // 명목 합
  readonly cumulativeGain: number
  readonly byAccount: Readonly<Record<AccountType, { balance: number; costBasis: number }>>
}

export interface AccumulationResult {
  readonly snapshots: readonly YearSnapshot[]
  readonly finalBalance: Money
  readonly totalPrincipal: number
  readonly totalGain: number
  readonly totalTaxPaid: number
  readonly finalAccounts: Readonly<Record<AccountType, AccountState>>
  readonly milestones: readonly { yearsFromNow: number; age: number; balance: Money }[]
}

export interface YearlyWithdrawalRow {
  readonly age: number
  readonly phase: string                 // '브리지 1' | '브리지 2' | '연금 수령기'
  readonly targetSpend: Money            // 목표 생활비
  readonly grossWithdrawal: number
  readonly withdrawalByAccount: Readonly<Record<AccountType, number>>
  readonly pensionIncome: number
  readonly incomeTax: number
  readonly healthInsurance: number
  readonly netIncome: Money              // ← 실수령. real이 핵심 지표
  readonly endingBalance: Money
}

export interface PhaseSummary {
  readonly name: string
  readonly fromAge: number
  readonly toAge: number
  readonly availableSources: readonly AccountType[]
  readonly avgMonthlyNet: Money
  readonly endingBalance: Money
}

export interface WithdrawalResult {
  readonly rows: readonly YearlyWithdrawalRow[]
  readonly phases: readonly PhaseSummary[]
  readonly firstYearMonthlyNet: Money    // ← Hero Metric의 원천
  readonly depletionAge: number | null
  readonly totalTaxPaid: number
  readonly totalInsurancePaid: number
}

export interface FireComparisonRow {
  readonly method: string                // '연 3.5% 인출' | '계획 소진형 (~95세)'
  readonly rate: number | null
  readonly requiredAssets: Money
  readonly monthlyWithdrawGross: number
  readonly monthlyNet: Money
  readonly isAchievable: boolean
  readonly shortfall: number             // 부족액 (명목, 0 이상)
}

export interface FireResult {
  readonly targetMonthlySpend: Money     // 은퇴 시점 명목 + 오늘 가치
  readonly comparison: readonly FireComparisonRow[]
  readonly achievementBySpend: number    // 주 지표
  readonly achievementByAsset: number
}

export interface Assumption {
  readonly label: string
  readonly value: string
  readonly derivation?: string
  readonly source?: string
  readonly asOf?: string
  readonly status?: 'confirmed' | 'proposed' | 'needs-verification' | 'approximation' | 'userOverride'
}

export interface Warning {
  readonly code: string                  // 'COMPREHENSIVE_TAX_THRESHOLD'
  readonly severity: 'info' | 'warn' | 'error'
  readonly message: string
  readonly relatedField?: string
}

export interface CalculationResult {
  readonly input: CalculatorInput        // 재현성 — 결과와 입력을 항상 함께 보관
  readonly normalizedReturns: NormalizedReturns
  readonly accumulation: AccumulationResult
  readonly withdrawal: WithdrawalResult
  readonly fire: FireResult
  readonly assumptions: readonly Assumption[]   // CLAUDE.md R-8 (필수)
  readonly warnings: readonly Warning[]
  readonly computedAtIso: string         // 호출자가 주입 (엔진은 Date를 모름)
}
```

---

## 3. Zod 스키마 (`src/lib/schema.ts`)

입력은 **URL·localStorage에서 복원될 때 반드시 Zod로 파싱**합니다. 신뢰할 수 없는 문자열이 계산 엔진에 들어가면 `NaN` 이 전파되어 조용히 잘못된 결과를 만듭니다.

```ts
export const calculatorInputSchema = z.object({
  schemaVersion: z.literal(1),
  basic: z.object({
    currentAge: z.number().int().min(19).max(80),
    retirementAge: z.number().int().min(20).max(85),
    endAge: z.number().int().min(21).max(110),
    salaryBracket: z.enum(['under55m', 'over55m']),
    isaType: z.enum(['general', 'lowIncome']),
    birthYear: z.number().int().min(1940).max(2010).optional(),
  }),
  returns: z.object({
    mode: z.enum(['totalReturn', 'split']),
    totalReturn: z.number().min(-0.05).max(0.20),
    priceReturn: z.number().min(-0.20).max(0.20),
    dividendYield: z.number().min(0).max(0.10),
    inflation: z.number().min(0).max(0.10),
    ter: z.number().min(0).max(0.02),
    retirementReturn: z.number().min(-0.05).max(0.15),
    reinvestDividends: z.boolean(),
    contributionTiming: z.enum(['begin', 'end']),
    volatility: z.number().min(0).max(0.60),
  }),
  // ... 이하 동일 패턴
})
.refine(v => v.basic.retirementAge > v.basic.currentAge,
        { message: '은퇴 나이는 현재 나이보다 커야 합니다', path: ['basic', 'retirementAge'] })
.refine(v => v.basic.endAge > v.basic.retirementAge,
        { message: '종료 나이는 은퇴 나이보다 커야 합니다', path: ['basic', 'endAge'] })
.refine(v => v.returns.dividendYield <= v.returns.totalReturn,
        { message: '배당수익률이 총수익률을 초과할 수 없습니다', path: ['returns', 'dividendYield'] })
```

**파싱 실패 시:** 기본값으로 폴백하고 "저장된 설정을 불러올 수 없어 기본값을 사용합니다" 알림을 표시합니다. 절대 조용히 `NaN` 을 통과시키지 않습니다.

---

## 4. 기본값 (`src/lib/defaults.ts`)

```ts
export const DEFAULT_INPUT: CalculatorInput = {
  schemaVersion: 1,
  basic: { currentAge: 35, retirementAge: 55, endAge: 95,
           salaryBracket: 'over55m', isaType: 'general' },
  returns: { mode: 'totalReturn', totalReturn: 0.07, priceReturn: 0.055,
             dividendYield: 0.015, inflation: 0.02, ter: 0.0015,
             retirementReturn: 0.04, reinvestDividends: true,
             contributionTiming: 'begin', volatility: 0.15 },
  accounts: { monthlyContribution: 1_000_000, contributionGrowthRate: 0.03,
              initialBalances: { taxable: 0, isa: 0, pensionSavings: 0, irp: 0, dcRetirement: 0 },
              allocationMode: 'auto',
              allocationPriority: ['pensionSavings', 'irp', 'isa', 'taxable'],
              etfKind: 'domesticListedForeign',
              reinvestTaxCredit: true, retirementIncomeTaxRate: 0.05 },
  retirement: { targetMonthlySpendToday: 3_000_000, strategy: 'fixedReal',
                withdrawalRate: 0.035,
                withdrawalPriority: ['taxable', 'isa', 'pensionSavings', 'irp', 'dcRetirement'],
                nationalPension: { monthlyAmountToday: 0, startAge: 65,
                                   isCompanyEstimate: true, inflationIndexed: true,
                                   effectiveTaxRate: 0.03 },
                otherPension: { monthlyAmountToday: 0, startAge: 60, inflationIndexed: false },
                healthInsurance: { mode: 'rateApprox' } },
  events: [],
  options: { taxRuleSetId: 'kr-2026', applyProposedRules: false,
             scenarioOffsets: { returnOffset: 0.02, inflationOffset: 0.005 },
             monteCarlo: { trials: 10_000, seed: 42, model: 'lognormal' } },
}
```

**기본값 선택 근거** (가정 패널에 노출):

| 값 | 근거 |
|---|---|
| 물가상승률 2.0% | 한국은행 물가안정목표 |
| 총수익률 7.0% | 글로벌 주식 장기 명목수익률의 보수적 하단. 낙관값(10%)을 기본으로 두지 않음 |
| 배당수익률 1.5% | 글로벌 주식 배당수익률 근사 |
| TER 0.15% | 국내 상장 대표 지수 ETF 수준 |
| 은퇴 후 수익률 4.0% | 채권 비중 상승을 반영한 보수적 가정 |
| 안전인출률 3.5% | 4% 룰의 한국 적용 한계를 반영한 보수적 값 (검토판 §2.15) |
| 종료 나이 95세 | 장수 리스크 대비 |
| 변동성 15% | 글로벌 주식 연 표준편차 근사 |

---

## 5. 상태 관리 (`src/store/`)

```ts
interface CalculatorStore {
  input: CalculatorInput
  result: CalculationResult | null
  lastValidResult: CalculationResult | null   // 입력 오류 시 결과 유지용
  validationErrors: Record<string, string>
  isComputing: boolean

  // 액션 — 경로 기반 패치
  patch<K extends keyof CalculatorInput>(key: K, value: Partial<CalculatorInput[K]>): void
  reset(): void
  loadFromUrl(search: string): void
  loadFromLocalStorage(): void
}
```

**재계산 정책**
- 기본 계산은 동기 실행 (목표 <50ms). 디바운스 불필요.
- 슬라이더 드래그 중에는 `requestAnimationFrame` 스로틀.
- Monte Carlo는 명시적 "실행" 버튼 (자동 실행 금지 — 3초 소요).
- 입력이 검증 실패해도 `lastValidResult` 를 계속 표시 → 화면이 비어버리지 않음.

---

## 6. URL 인코딩 (`src/lib/url-codec.ts`) — R12

프라이버시 원칙(CLAUDE.md R-7)상 서버 저장이 없으므로, 공유는 URL에 상태를 담는 방식뿐입니다.

```
https://<host>/?v=1&s=<base64url(deflate(json))>
```

- `v` = schemaVersion (마이그레이션 판정)
- `s` = 압축·인코딩된 입력. `CompressionStream('deflate-raw')` 사용 (브라우저 네이티브, 의존성 0)
- 목표 길이 2,000자 이하 → 대부분의 환경에서 안전
- 기본값과 동일한 필드는 **직렬화에서 제외**해 길이를 줄입니다 (diff 인코딩)

**공유 시 경고:** "이 링크에는 입력한 금액 정보가 포함됩니다. 공유 대상에 주의하세요." — 사용자가 자기 소득·자산을 무심코 공개할 위험이 실재합니다.

**localStorage:** 키 `economy-calculator:input:v1`. 자동 저장(디바운스 1s). "저장된 데이터 삭제" 버튼을 설정에 제공합니다.

---

## 7. 스키마 마이그레이션

`schemaVersion` 이 올라가면 마이그레이션 함수를 체인으로 적용합니다.

```ts
const MIGRATIONS: Record<number, (old: unknown) => unknown> = {
  // 1 → 2 예시
  // 2: (v1) => ({ ...v1, schemaVersion: 2, newField: defaultValue }),
}
```
입력 필드를 추가·변경할 때는 **반드시** `schemaVersion` 을 올리고 마이그레이션을 작성합니다. 저장된 링크가 깨지면 사용자가 계산 결과를 잃습니다.
