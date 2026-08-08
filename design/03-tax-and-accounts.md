# 03. 세제 · 계좌 모델

대응 요구사항: R6(계좌·세제), R7(공적연금·건강보험료)

> **기준일: 2026-08-08.** 모든 수치는 구현 시 1차 자료로 재확인해야 합니다. 이 문서는 스냅샷이며, 코드의 진실은 `src/data/tax/kr-2026.ts` 입니다.

---

## 1. 설계 원칙 (CLAUDE.md R-2 ~ R-3의 구체화)

1. 계산 엔진은 세율을 **모릅니다**. `TaxRuleSet` 을 인자로 받습니다.
2. 룰셋은 연도별 파일로 분리하고 기존 파일은 수정하지 않습니다 (`kr-2026.ts` → `kr-2027.ts`).
3. 모든 항목에 `source` / `asOf` / `status` 가 붙습니다.
4. `status: "proposed"` (국회 통과 전 개정안)는 기본 계산에서 제외. 사용자 토글로만 활성화.
5. 사용자가 개별 세율을 오버라이드할 수 있습니다 (고급 설정). 오버라이드 시 가정 패널에 "사용자 지정" 배지 표시.

---

## 2. 계좌 유형 모델

### 2.1 계좌 타입

```ts
type AccountType =
  | 'taxable'          // 일반 증권계좌
  | 'isa'              // ISA (중개형 기준)
  | 'pensionSavings'   // 연금저축
  | 'irp'              // IRP
  | 'dcRetirement'     // DC형 퇴직연금 / 퇴직금 (IRP와 유사 취급)
```

### 2.2 계좌별 과세 요약

| 계좌 | 축적기 배당 | 축적기 매매차익 | 인출기 과세 | 납입한도 | 인출 제약 |
|---|---|---|---|---|---|
| **일반계좌** | 15.4% 원천징수 (즉시) | 매도 시 과세 (§3) | 매매차익분에만 과세 | 없음 | 없음 |
| **ISA** | 과세이연 | 과세이연 | 만기 시 순이익에서 비과세 한도 차감, 초과분 9.9% 분리과세 | 연 4,000만원 / 총 2억원 | 의무 3년 |
| **연금저축** | 과세이연 | 과세이연 | 연금소득세 3.3~5.5% (55세 이후) | IRP 합산 연 1,800만원 | 55세 이후, 연금수령한도 |
| **IRP** | 과세이연 | 과세이연 | 위와 동일 (퇴직금 재원은 퇴직소득세 감면) | 위와 합산 | 위와 동일 |
| **DC/퇴직금** | 과세이연 | 과세이연 | 퇴직소득세 (연금 수령 시 30~40% 감면) | — | 55세 이후 |

**핵심 통찰:** ISA와 연금계좌의 진짜 가치는 "세금이 없다"가 아니라 **축적기 배당 원천징수가 없어서 재투자 복리가 온전히 작동한다**는 점입니다. 일반계좌는 매년 배당의 15.4%가 빠져나가 30년간 누적되면 큰 차이가 됩니다. 계산 엔진이 이 차이를 정확히 드러내야 합니다.

### 2.3 ETF 유형별 과세 (원안 107행)

```ts
type EtfKind =
  | 'domesticEquity'      // 국내 상장 + 국내주식형: 매매차익 비과세
  | 'domesticListedForeign' // 국내 상장 + 해외지수/채권/파생형: 매매차익 배당소득 15.4%
  | 'foreignListed'       // 해외 상장 (미국 등): 양도소득 22%, 연 250만원 공제
```

| 구분 | 매매차익 | 분배금 | 손익통산 | 종합과세 합산 |
|---|---|---|---|---|
| 국내상장·국내주식형 | **비과세** | 15.4% | — | 분배금만 |
| 국내상장·해외/채권/파생형 | 15.4% (배당소득) | 15.4% | 불가 | **합산** (2,000만원 기준) |
| 해외상장 | 22% (양도소득), 250만원 공제 | 15.4% | 가능 | 매매차익은 **미합산**(분리과세) |

**구현 시 주의:**
- 국내상장 해외ETF 매매차익은 배당소득이라 **250만원 기본공제가 없습니다.** 해외상장과 혼동하기 쉬운 지점.
- 국내상장 해외ETF의 실제 과세표준은 `min(과표기준가 증가분, 실제 매매차익)` 입니다. 과표기준가를 모사할 수 없으므로 **실제 매매차익 전액**을 과세표준으로 근사하고(보수적), 가정 패널에 명시합니다.
- 해외상장 ETF의 250만원 공제는 **연간 합산 공제**이므로 인출기 연 단위 루프에서 연 1회만 적용합니다.

---

## 3. 축적기 과세 계산 (`src/calc/tax/accumulation.ts`)

```
function taxOnDividend(dividend, accountType, etfKind, rules): number {
  if (accountType !== 'taxable') return 0        // ISA·연금계좌는 과세이연
  return dividend * rules.dividendWithholding.rate   // 15.4%
}
```

축적기에는 **매도가 없다고 가정**합니다(리밸런싱 미반영). 리밸런싱 시 실현 과세는 MVP 범위 밖이며, 가정 패널에 "리밸런싱으로 인한 중도 실현 과세는 반영하지 않습니다"로 고지합니다.

**금융소득종합과세 경고:** 축적기에도 일반계좌 배당이 연 2,000만원을 넘을 수 있습니다. 초과 시 세부담이 15.4%를 넘지만 **정확한 종합소득세 계산은 하지 않고 경고만 표시**합니다(다른 소득을 모르므로). 이는 명시적 한계입니다.

---

## 4. 인출기 과세 계산 (`src/calc/tax/withdrawal.ts`) — 검토판 §2.2

### 4.1 일반계좌

인출액 중 차익 비율만 과세됩니다.

```
gainRatio = max(0, (balance - costBasis)) / balance
taxableGain = withdrawalAmount * gainRatio

// 국내상장·국내주식형
tax = 0

// 국내상장·해외/채권/파생형 (배당소득)
tax = taxableGain * 0.154

// 해외상장 (양도소득, 연 250만원 공제)
tax = max(0, taxableGain - 2_500_000) * 0.22

// 인출 후 costBasis 갱신 (비례 차감)
costBasis -= withdrawalAmount * (costBasis / balance)
balance   -= withdrawalAmount
```

### 4.2 ISA

ISA는 **만기 해지 시점에 한 번** 정산됩니다. 인출기 첫 해에 전액 해지하는 것으로 모델링하는 것은 비현실적이므로, MVP는 다음과 같이 처리합니다.

```
// 은퇴 시점(= 만기 해지 시점)에 1회 정산
netProfit = balance - totalContributed
exemptLimit = isaType === 'general' ? 2_000_000 : 4_000_000
taxable = max(0, netProfit - exemptLimit)
tax = taxable * 0.099                    // 9.9% 분리과세

// 정산 후 잔액은 '일반계좌'로 이관하되 costBasis = balance - tax (전액 원금화)
```

정산 후 ISA 자산은 일반계좌로 이전된 것으로 간주하고 이후 성장분에 일반계좌 과세를 적용합니다. **연금계좌 이체 시 추가 세액공제(이체금액의 10%, 최대 300만원)** 옵션도 데이터 파일에 두되 MVP에서는 미적용(`status: "needs-verification"`).

의무가입기간 3년 미충족 시 혜택 상실 → 비과세 한도 0, 일반 세율 적용으로 계산하고 경고를 띄웁니다.

### 4.3 연금저축 / IRP

```
// 과세 대상 = 세액공제 받은 원금 + 운용수익
// 비과세 = 세액공제 받지 않은 원금 (먼저 인출되는 것으로 간주)
taxablePortion = withdrawalAmount * (deductedPrincipal + gain) / balance

// 연령별 연금소득세율
rate = age <  70 ? 0.055
     : age <  80 ? 0.044
     :             0.033

tax = taxablePortion * rate

// 연 1,500만원 초과 시 (사적연금 합산)
if (annualPrivatePensionIncome > 15_000_000):
  // 종합과세 vs 16.5% 분리과세 중 유리한 쪽 → MVP는 16.5% 분리과세로 계산
  tax = taxablePortion * 0.165
  warn('사적연금 분리과세 한도 초과')

// 연금수령한도 초과분은 기타소득세 16.5%
limit = balance / (11 - pensionYearIndex) * 1.2
if (withdrawalAmount > limit):
  excess = withdrawalAmount - limit
  tax += excess * (0.165 - rate)     // 초과분에 대한 추가 세부담
```

**주의:** 연 1,500만원 초과 시 종합과세가 더 유리할 수도 있으나(다른 소득이 적으면), 다른 소득을 모르므로 **16.5% 분리과세로 보수적 계산**하고 이를 가정 패널에 명시합니다.

### 4.4 DC형 퇴직연금 / 퇴직금

```
// 퇴직소득세를 연금으로 수령 시 감면
// 수령 10년 이내: 퇴직소득세 × 0.7,  10년 초과분: × 0.6
effectiveRate = retirementIncomeTaxRate * (pensionYearIndex <= 10 ? 0.70 : 0.60)
```
퇴직소득세율 자체는 근속연수·퇴직금 규모에 따른 복잡한 산식이므로, MVP는 **사용자가 실효세율을 직접 입력**(기본값 5%)하게 하고 `status: "approximation"` 으로 표시합니다.

### 4.5 Gross-up 통합

`02-calculation-engine.md` §6.2의 `solveGross` 가 위 함수들을 호출합니다. 인출 우선순위에 따라 계좌 조합이 달라지므로 세율이 인출액에 비선형으로 의존하며, 이 때문에 이분법 역산이 필요합니다.

---

## 5. 공적연금 모델 (R7)

### 5.1 국민연금 개혁 (2026-01-01 시행)

| 항목 | 값 | 비고 |
|---|---|---|
| 보험료율 | 2026년 **9.5%**, 매년 0.5%p → 2033년 13% | 확정 |
| 소득대체율 | 2026년부터 **43%** (40년 가입 기준) | 확정 |
| A값 (전체 가입자 평균소득) | 3,193,511원 (2026년) | 확정 |
| 기준소득월액 | 상한 659만원 / 하한 41만원 (2026-07 적용) | 확정 |

### 5.2 노령연금 산식 (참고용 — 사용자 입력 보조)

```
연금액 = 1.29 × (A + B) × (1 + 0.05 × n / 12) × 지급률
  A = 연금수급 전 3년간 전체 가입자 평균소득월액
  B = 가입자 개인의 가입기간 중 기준소득월액 평균액
  n = 20년 초과 가입월수
```

**MVP 방침:** 이 산식으로 직접 추정하지 않습니다. 사용자가 **국민연금공단 "내 연금 알아보기"에서 조회한 예상 월 수령액을 입력**하게 하고, 화면에 조회 링크를 제공합니다. 이유: 가입 이력·소득 이력을 정확히 받으려면 입력 부담이 과도하고, 공단 추정치가 훨씬 정확합니다.

산식은 "참고" 아코디언에 표시하고, 간단 추정기는 P2로 둡니다.

### 5.3 연금소득 과세 (공적연금)

공적연금은 종합과세 대상이지만 연금소득공제가 크고 다른 소득에 의존합니다.

**MVP 방침:** 국민연금에 대한 실효세율을 **사용자 입력 (기본 3%)** 으로 두고 `status: "approximation"` 표시. 다른 소득 없이 국민연금만 있는 경우 실제 세부담은 매우 낮습니다.

### 5.4 조기·연기 수령

| 구분 | 조정 |
|---|---|
| 조기수령 (최대 5년) | 연 6% 감액 (월 0.5%), 5년 조기 시 70% |
| 연기수령 (최대 5년) | 연 7.2% 증액 (월 0.6%), 5년 연기 시 136% |

수급 개시 연령은 출생연도별로 다릅니다(1969년 이후 출생 65세). 데이터 파일에 출생연도 → 기준 연령 매핑을 둡니다.

### 5.5 물가연동

국민연금은 매년 전국소비자물가변동률을 반영해 인상됩니다 → **실질가치 유지**. 계산에서 기본 ON.
사적연금(연금저축·IRP 인출액)은 사용자가 인출액을 정하므로 인출 전략에 따라 결정됩니다.
연금보험·주택연금 등 정액형 사적연금은 **비연동** 기본값.

---

## 6. 건강보험료 모델 (R7, 검토판 §2.3)

### 6.1 2026년 요율

| 항목 | 값 |
|---|---|
| 건강보험료율 | 7.19% |
| 장기요양보험료율 | 0.9448% (건강보험료의 13.14%) |
| 합산 실효 요율 (소득 대비) | 약 **8.13%** = 0.0719 × 1.1314 |
| 지역가입자 재산 부과점수당 금액 | 211.5원 |

### 6.2 3가지 모드 (재확인)

| 모드 | 계산 | 용도 |
|---|---|---|
| A. 미반영 | 0 | 피부양자 등재 가능한 경우 |
| B. 요율 근사 (기본) | `assessableIncome × 0.0813` | 대부분의 경우 |
| C. 정액 입력 | 사용자 입력 × 12 | 실제 고지액을 아는 경우 |

### 6.3 소득 인정 근사

```
assessableIncome =
    공적연금소득 × 0.50              // 연금소득 인정 비율 근사
  + max(0, 금융소득 - 10_000_000)    // 연 1,000만원 초과 시 포함
  + 기타소득
// 사적연금(연금저축·IRP) 인출: 부과 대상 아님 (현행)
// 재산 보험료: 모델링하지 않음 → 과소 추정
```

**필수 고지 문구:** "건강보험료는 소득 기준 근사값입니다. 재산·자동차 등에 따라 실제 부과액은 더 클 수 있습니다."

`status: "needs-verification"` — 금융소득 1,000만원 기준과 연금소득 인정 비율은 구현 시 국민건강보험공단 1차 자료로 재확인 필요.

---

## 7. 데이터 파일 스키마

### 7.1 타입 정의 (`src/data/tax/types.ts`)

```ts
type RuleStatus = 'confirmed' | 'proposed' | 'needs-verification' | 'approximation'

interface Sourced<T> {
  value: T
  source: string          // URL (1차 자료 우선)
  asOf: string            // 'YYYY-MM-DD'
  status: RuleStatus
  note?: string
}

interface TaxRuleSet {
  id: string                          // 'kr-2026'
  label: string                       // '대한민국 2026년 기준'
  effectiveFrom: string               // '2026-01-01'
  lastReviewed: string                // '2026-08-08'

  dividendWithholding: Sourced<{ rate: number }>            // 0.154
  comprehensiveIncomeThreshold: Sourced<{ amount: number }>  // 20_000_000

  etf: {
    domesticEquity:          Sourced<{ capitalGainsRate: number }>   // 0
    domesticListedForeign:   Sourced<{ capitalGainsRate: number }>   // 0.154
    foreignListed:           Sourced<{ capitalGainsRate: number; annualDeduction: number }>
  }

  isa: {
    annualLimit:      Sourced<{ amount: number }>   // 40_000_000
    lifetimeLimit:    Sourced<{ amount: number }>   // 200_000_000
    exemptGeneral:    Sourced<{ amount: number }>   // 2_000_000
    exemptLowIncome:  Sourced<{ amount: number }>   // 4_000_000
    excessRate:       Sourced<{ rate: number }>     // 0.099
    minHoldingYears:  Sourced<{ years: number }>    // 3
    carryOverUnused:  Sourced<{ enabled: boolean }>
  }

  pensionAccount: {
    combinedAnnualLimit:   Sourced<{ amount: number }>  // 18_000_000
    creditLimitSavings:    Sourced<{ amount: number }>  // 6_000_000
    creditLimitCombined:   Sourced<{ amount: number }>  // 9_000_000
    creditRateLow:         Sourced<{ rate: number }>    // 0.165 (총급여 5,500만 이하)
    creditRateHigh:        Sourced<{ rate: number }>    // 0.132
    creditIncomeThreshold: Sourced<{ amount: number }>  // 55_000_000
    withdrawalRates:       Sourced<{ under70: number; under80: number; over80: number }>
    separateTaxThreshold:  Sourced<{ amount: number }>  // 15_000_000
    separateTaxRate:       Sourced<{ rate: number }>    // 0.165
    earlyWithdrawalRate:   Sourced<{ rate: number }>    // 0.165
    annualLimitFactor:     Sourced<{ divisorBase: number; multiplier: number }> // 11, 1.2
    minAge:                Sourced<{ age: number }>     // 55
  }

  nationalPension: {
    contributionRate:      Sourced<{ rate: number }>          // 0.095 (2026)
    incomeReplacementRate: Sourced<{ rate: number }>          // 0.43
    aValue:                Sourced<{ amount: number }>        // 3_193_511
    incomeCeiling:         Sourced<{ amount: number }>        // 6_590_000
    incomeFloor:           Sourced<{ amount: number }>        // 410_000
    earlyReductionPerYear: Sourced<{ rate: number }>          // 0.06
    deferralBonusPerYear:  Sourced<{ rate: number }>          // 0.072
    normalAgeByBirthYear:  Sourced<{ table: [number, number][] }>
    inflationIndexed:      Sourced<{ enabled: boolean }>      // true
    effectiveTaxRate:      Sourced<{ rate: number }>          // 0.03 (approximation)
  }

  healthInsurance: {
    rate:                  Sourced<{ rate: number }>   // 0.0719
    longTermCareRatio:     Sourced<{ ratio: number }>  // 0.1314 (건보료 대비)
    pensionIncomeRecognitionRatio: Sourced<{ ratio: number }>  // 0.50 (approximation)
    financialIncomeThreshold:      Sourced<{ amount: number }> // 10_000_000
  }

  inflation: {
    bokTarget: Sourced<{ rate: number }>   // 0.02
  }

  // status: 'proposed' 항목만 모아둠 — 토글로 활성화
  proposed?: {
    isaExemptGeneral?:   Sourced<{ amount: number }>   // 5_000_000
    isaExemptLowIncome?: Sourced<{ amount: number }>   // 10_000_000
    productiveFinanceIsa?: Sourced<{ annualLimit: number; lifetimeLimit: number; fullyExempt: boolean }>
  }
}
```

### 7.2 룰셋 조회

```ts
// src/data/tax/index.ts
export const RULE_SETS: TaxRuleSet[] = [KR_2026]

export function getRuleSet(id = 'kr-2026'): TaxRuleSet
export function applyProposed(rules: TaxRuleSet): TaxRuleSet   // 개정안 토글
export function applyOverrides(rules: TaxRuleSet, overrides: Partial<...>): TaxRuleSet
```

**골든 테스트는 반드시 룰셋 ID를 명시적으로 지정합니다** — 기본값이 바뀌어도 테스트가 깨지지 않게.

---

## 8. 2026-08-08 확정 데이터 값

| 항목 | 값 | status |
|---|---|---|
| 금융투자소득세 | 폐지 (2024-12-10 개정) | confirmed |
| 배당·이자 원천징수 | 15.4% (14% + 지방세 1.4%) | confirmed |
| 금융소득종합과세 기준 | 20,000,000원 | confirmed |
| 국내주식형 ETF 매매차익 | 비과세 | confirmed |
| 국내상장 해외/채권/파생 ETF 매매차익 | 15.4% (배당소득, 공제 없음) | confirmed |
| 해외상장 ETF 매매차익 | 22% (양도소득), 공제 2,500,000원/년 | confirmed |
| 증권거래세 | 코스피 0.15%(농특세) / 코스닥 0.15% | confirmed |
| ISA 연 납입한도 | 40,000,000원 | confirmed |
| ISA 총 납입한도 | 200,000,000원 | confirmed |
| ISA 비과세 한도 (일반형) | 2,000,000원 | **needs-verification** |
| ISA 비과세 한도 (서민형) | 4,000,000원 | **needs-verification** |
| ISA 초과분 세율 | 9.9% | confirmed |
| ISA 의무가입기간 | 3년 | confirmed |
| 연금저축+IRP 납입한도 | 18,000,000원 | confirmed |
| 연금저축 세액공제 한도 | 6,000,000원 | confirmed |
| 연금저축+IRP 세액공제 한도 | 9,000,000원 | confirmed |
| 세액공제율 | 16.5% (총급여 5,500만 이하) / 13.2% | confirmed |
| 연금소득세율 | 5.5% (~69세) / 4.4% (70~79) / 3.3% (80~) | confirmed |
| 사적연금 분리과세 기준 | 15,000,000원 | confirmed |
| 사적연금 초과 시 분리과세율 | 16.5% | confirmed |
| 연금계좌 중도해지 기타소득세 | 16.5% | confirmed |
| 국민연금 보험료율 (2026) | 9.5% → 2033년 13% | confirmed |
| 국민연금 소득대체율 | 43% | confirmed |
| 국민연금 A값 (2026) | 3,193,511원 | confirmed |
| 국민연금 기준소득월액 상한/하한 | 6,590,000 / 410,000원 | confirmed |
| 국민연금 조기수령 감액 | 연 6% | confirmed |
| 국민연금 연기수령 증액 | 연 7.2% | confirmed |
| 건강보험료율 (2026) | 7.19% | confirmed |
| 장기요양보험료율 (2026) | 0.9448% (건보료의 13.14%) | confirmed |
| 지역가입자 재산 부과점수당 금액 | 211.5원 | confirmed |
| 한국은행 물가안정목표 | 2.0% | confirmed |
| 배당소득 분리과세 특례 (고배당기업) | 2,000만 이하 14% / ~3억 20% / ~50억 25% / 초과 30%, 2026~2028 사업연도 | confirmed |

### 개정안 (status: proposed — 기본 비활성)

| 항목 | 값 | 근거 |
|---|---|---|
| ISA 비과세 한도 상향 | 일반형 500만원 / 서민형 1,000만원 | 2026 세제개편안 |
| 생산적 금융 ISA | 국내주식 등 전용, 이자·배당 전액 비과세, 연 2,000만원 / 총 2억원, 의무 3년, 2029-12-31까지 가입 | 2026 세제개편안 (2026-08-03 발표) |
| 청년형 생산적 금융 ISA | 34세 이하 · 총급여 7,500만원 이하, 납입액 10% 소득공제 (최대 200만원) | 동일 |
| BDC 배당소득 분리과세 | 9%, 납입금 1억원 한도 | 동일 |

---

## 9. 알려진 한계 (UI에 반드시 고지)

| 한계 | 이유 |
|---|---|
| 금융소득종합과세를 정확히 계산하지 않음 (경고만) | 다른 소득을 알 수 없음 |
| 종합소득세 누진구간 미적용 | 위와 동일 |
| 국내상장 해외ETF 과표기준가 미모사 → 매매차익 전액 과세로 근사 | 과표기준가는 상품별 실데이터 필요 |
| 건강보험료 재산 부과 미반영 | 재산 상세 입력이 과도 |
| 퇴직소득세를 실효세율 입력으로 근사 | 근속연수·규모별 산식이 복잡 |
| 축적기 리밸런싱 실현 과세 미반영 | 리밸런싱 빈도·규모를 알 수 없음 |
| 환율 미반영 (원화 기준 수익률 가정) | MVP 범위 |
| ISA 미사용 한도 이월 미반영 (보수적) | MVP 범위 |
| 기초연금 미반영 | 자산가 대상 계산기에서 해당 가능성 낮음 |
| 세법 변경 가능성 | 기준일 명시로 대응 |

---

## 10. 출처

- [보건복지부 — 연금개혁법안 국회 통과](https://www.mohw.go.kr/board.es?mid=a10503000000&bid=0027&list_no=1485039&act=view)
- [보건복지부 — 2026년도 장기요양보험료율 0.9448%](https://www.mohw.go.kr/board.es?mid=a10503010100&bid=0027&act=view&list_no=1487817)
- [국민건강보험공단 — 2026년 달라지는 건강보험·장기요양보험 제도](https://www.nhis.or.kr/renewal_popup/poster/20260204_poster_longdesc_1.html)
- [국민연금공단 — 2026년 기준소득월액 상·하한액 조정](https://www.nps.or.kr/pnsgdnc/newgdnc/getOHAE0001M1.do?pstId=ZZ202600000000000147)
- [국세청 — 연금소득 원천징수](https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?mi=6608&cntntsId=7888)
- [아주경제 — 2026 세제개편안 (생산적 금융 ISA)](https://www.ajunews.com/view/20260803101556407)
- [KB — 국내·해외상장 ETF 과세 비교](https://kbthink.com/etf/etf-tax.html)
- [KB — 2026년 달라지는 세법](https://kbthink.com/tax/expert/gw/251230.html)
- [KB — 금투세 폐지 총정리](https://kbthink.com/main/asset-management/wealth-manage-tip/kbthink-original/202408/financial_investment_income_tax.html)
- [삼성자산운용 Kodex — ETF 세금](https://www.samsungfund.com/etf/insight/guide/view05.do)
- [삼일PwC — 금융상품별 과세방식](https://www.pwc.com/kr/ko/insights/issue-brief/one-point-tax-11.html)
- [삼성증권 — 연금저축·IRP 세액공제](https://www.samsungpop.com/mbw/o2Info/contents.do?cmd=detail&boardId=1398&isEbd=Y)
- [미래에셋증권 — 2026 고배당기업 배당소득 분리과세](https://magazine.securities.miraeasset.com/contents.php?category=advisory&idx=1568)
- [KPMG — 2025 Tax Reform (PDF)](https://assets.kpmg.com/content/dam/kpmgsites/kr/pdf/2026/tkc/korean-tax-brief/2025-Tax-Reform_KOR.pdf)
