# 02. 계산 엔진 설계

대응 요구사항: R2(축적기), R3(FIRE), R4(인출기), R5(명목/실질), R8(시나리오·MC), R9(솔버)

> 이 문서의 수식이 구현의 유일한 기준입니다. 구현이 다르면 코드가 아니라 이 문서를 먼저 고치세요.

---

## 0. 표기 규약

| 기호 | 의미 |
|---|---|
| `p` | 연 가격상승률 (price return) |
| `d` | 연 배당수익률 (dividend yield) |
| `r = p + d` | 연 총수익률 (total return) |
| `f` | ETF 연간 총보수 (TER) |
| `i` | 연 물가상승률 |
| `w` | 안전인출률 |
| `r_ret` | 은퇴 후 연 기대수익률 |
| `Y` | 축적 기간 연수 = 은퇴나이 − 현재나이 |
| `N` | 축적 기간 월수 = `Y × 12` |
| `n` | 인출 기간 연수 = 종료나이 − 은퇴나이 |
| `t` | 월 인덱스 (0-based) |

모든 비율은 소수(0.07 = 7%). 모든 금액은 원(KRW).

---

## 1. 기본 환산식 (`src/calc/rates.ts`)

### 1.1 연 → 월 수익률 (기하평균 — **필수**)
```
monthlyPriceReturn(p) = (1 + p) ** (1 / 12) - 1
```
`p / 12` 은 **금지**. 연 7%에서 두 방식의 30년 차이는 수 % 수준으로 무시할 수 없습니다.

### 1.2 월 배당수익률 (단순 안분)
```
monthlyDividendYield(d) = d / 12
```
배당은 자산에 대한 **흐름(flow)** 이므로 기하 변환하지 않고 안분합니다. 이 선택의 결과로, 배당 재투자 시 실현 총수익률이 입력 총수익률보다 극미하게 높아집니다(d=1.5%일 때 연 약 +0.01%p). 의도된 근사이며 가정 패널에 명시하지 않아도 되는 수준이지만, 코드 주석에는 남깁니다.

### 1.3 TER 차감 (자산 비례)
```
monthlyFeeFactor(f) = (1 - f) ** (1 / 12)
```
보수는 자산에 매일 비례 차감되므로 수익률에서 빼는 것이 아니라 **자산에 곱합니다**. 단순히 `r - f` 로 처리하면 자산이 클 때 오차가 커집니다.

### 1.4 보수 차감 후 명목 수익률 (표시용)
```
netNominalReturn(r, f) = (1 + r) * (1 - f) - 1
```

### 1.5 실질 수익률 (Fisher 정확식 — **필수**)
```
realReturn(nominal, i) = (1 + nominal) / (1 + i) - 1
```
`nominal - i` 은 **금지**.

### 1.6 명목 → 실질 환산 (오늘 구매력 기준)
```
toReal(nominalAmount, i, yearsFromNow) = nominalAmount / (1 + i) ** yearsFromNow
```
`yearsFromNow` 는 **계산 실행일 기준** 경과 연수입니다. 월 단위 정밀도가 필요하면 `months / 12` 를 사용합니다.

### 1.7 실질 → 명목 (미래 시점 금액)
```
toNominal(realAmount, i, yearsFromNow) = realAmount * (1 + i) ** yearsFromNow
```

---

## 2. 계좌 배분 (`src/calc/allocate.ts`)

월 납입 총액을 계좌별로 분배합니다. **연 단위 한도**를 월 단위로 추적해야 하므로, 배분은 연도별로 계산하고 월 배분은 그 연도의 배분 비율을 사용합니다.

### 2.1 알고리즘

```
function allocateYear(annualContribution, priorities, limits, yearState):
  remaining = annualContribution
  result = {}
  for account in priorities:            // 사용자 지정 우선순위 순
    cap = remainingCapacity(account, limits, yearState)
    amount = min(remaining, cap)
    result[account] = amount
    remaining -= amount
    if remaining <= 0: break
  result['taxable'] += remaining        // 넘친 금액은 항상 일반계좌로
  return result
```

### 2.2 한도 (2026 기준, 데이터 파일에서 주입)

| 계좌 | 연 한도 | 비고 |
|---|---|---|
| 연금저축 | 1,800만원 (세액공제는 600만원까지) | IRP와 **합산** 1,800만원 |
| IRP | 위와 합산 1,800만원 (세액공제는 합산 900만원까지) | |
| ISA | 4,000만원 (총 2억원 누적) | 누적 한도도 추적 |
| 일반계좌 | 무제한 | 오버플로 수용 |

**중요:** 연금저축+IRP는 **합산 한도**이므로 개별 잔여한도를 독립적으로 계산하면 안 됩니다. `pensionCombinedUsed` 상태를 공유합니다.

ISA는 미사용 한도 이월 규정이 있으나 MVP에서는 **이월 미반영**(보수적)으로 처리하고 가정 패널에 명시합니다.

### 2.3 세액공제 환급금 재투자

```
taxCredit(year) = min(pensionSavingsPaid, 600만) * creditRate
               + min(irpPaid, 900만 - min(pensionSavingsPaid, 600만)) * creditRate
creditRate = 총급여 5,500만원 이하 ? 0.165 : 0.132
```

환급금은 **다음 연도**에 발생(연말정산 시점)하므로 `year + 1` 의 납입액에 가산합니다. 재투자 토글이 OFF면 무시합니다.

---

## 3. 축적기 시뮬레이션 (`src/calc/accumulate.ts`)

### 3.1 계좌별 상태

```ts
interface AccountState {
  balance: number             // 평가액
  costBasis: number           // 취득원가 (납입액 + 세후 재투자 배당)
  deductedPrincipal: number   // 연금계좌: 세액공제 받은 원금
  nonDeductedPrincipal: number// 연금계좌: 세액공제 받지 않은 원금
  totalContributed: number    // 누적 납입액 (ISA 순이익 계산용)
  taxPaidCumulative: number   // 누적 납부 세금 (표시용)
}
```

### 3.2 월별 루프 — 계산 순서 (**고정**)

`contributionTiming = 'begin'` (기본, annuity-due):

```
1. balance += contribution                      // 월초 납입
   costBasis += contribution
   totalContributed += contribution

2. dividend = balance * (d / 12)                 // 배당 발생

3. dividendTax = taxOnDividend(dividend, account, taxRules)
                                                 // 일반계좌만 15.4%
                                                 // ISA/연금계좌는 0 (과세이연)

4. netDividend = dividend - dividendTax
   if (reinvestDividends):
     balance += netDividend
     costBasis += netDividend                    // 재투자분은 취득원가 가산
   else:
     cashOut += netDividend                      // 자산에 반영 안 함

5. balance *= (1 + monthlyPriceReturn(p))        // 가격 상승

6. balance *= monthlyFeeFactor(f)                // 보수 차감
```

`contributionTiming = 'end'` 이면 1단계를 6단계 뒤로 옮깁니다(배당·성장이 기존 잔액에만 적용).

### 3.3 연 단위 처리

12개월마다:
1. 연 스냅샷 기록 (§3.4)
2. 월 납입액 증액: `contribution *= (1 + contributionGrowthRate)`
3. 세액공제 환급금 계산 → 다음 연도 납입에 가산
4. 일회성 현금흐름 이벤트 적용 (해당 나이면)
5. 계좌 한도 리셋 및 재배분

**일회성 이벤트 처리:** 유입은 배분 우선순위에 따라 계좌에 추가, 유출은 인출 우선순위에 따라 차감(차감 시 일반계좌 매매차익 과세 반영). 실질 기준 입력이면 `toNominal()` 로 변환 후 적용.

### 3.4 연 스냅샷

```ts
interface YearSnapshot {
  age: number
  yearIndex: number                    // 0 = 첫 해
  contributionThisYear: number
  dividendThisYear: number
  taxThisYear: number
  balanceNominal: number               // 전 계좌 합
  balanceReal: number                  // = balanceNominal / (1+i)^yearIndex+1
  cumulativePrincipal: number          // 누적 납입원금 (명목 합)
  cumulativeGain: number               // = balanceNominal - cumulativePrincipal
  byAccount: Record<AccountType, { balance: number; costBasis: number }>
}
```

**`cumulativeGain` 정의:** `총자산 − 누적 납입원금`. 여기서 누적 납입원금은 명목 합계(물가 미조정)이며, 이는 사용자가 "내가 실제로 넣은 돈"으로 인식하는 값과 일치합니다. 실질 기준 원금도 별도 필드로 제공하되 기본 표시는 명목입니다.

### 3.5 결과

```
accumulate(input, taxRules) → {
  snapshots: YearSnapshot[]            // 길이 = Y
  finalAccounts: Record<AccountType, AccountState>
  totalPrincipalNominal: number
  totalGainNominal: number
  finalBalanceNominal: number
  finalBalanceReal: number             // = finalBalanceNominal / (1+i)^Y
  totalTaxPaid: number
  milestones: { years: 5|10|15|20|30, nominal, real }[]
}
```

---

## 4. 목표 생활비 환산 (`src/calc/spending.ts`)

원안 49행의 요구입니다.

```
// 오늘 기준 월 생활비 C0 → 은퇴 시점 명목 월 생활비
monthlySpendAtRetirement = C0 * (1 + i) ** Y

// 임의 나이 age 시점의 명목 월 생활비 (실질 생활수준 유지)
monthlySpendAtAge(age) = C0 * (1 + i) ** (age - currentAge)
```

---

## 5. 연금소득 모델 (`src/calc/pension.ts`)

### 5.1 국민연금

입력은 **현재가치 월 수령액** `P0` 입니다.

```
// 물가연동 ON (기본, 제도 실제)
nationalPensionAt(age) = age >= startAge
    ? P0 * (1 + i) ** (age - currentAge)     // 명목. 실질로는 항상 P0
    : 0

// 물가연동 OFF
nationalPensionAt(age) = age >= startAge
    ? P0 * (1 + i) ** (startAge - currentAge)  // 개시 시점에 고정, 이후 실질 하락
    : 0
```

### 5.2 조기·연기 수령 조정

```
adjustmentFactor(startAge, normalAge) =
  startAge < normalAge ? 1 - 0.06 * (normalAge - startAge)   // 조기: 연 6% 감액 (월 0.5%)
: startAge > normalAge ? 1 + 0.072 * (startAge - normalAge)  // 연기: 연 7.2% 증액 (월 0.6%)
: 1
```
`normalAge` 는 출생연도별 기준(데이터 파일). 조정 계수는 `P0` 에 곱합니다. 사용자가 이미 조정된 금액을 입력했을 수 있으므로 **"공단 예상액을 그대로 입력했나요?" 체크박스**로 이중 적용을 방지합니다.

### 5.3 기타 연금 (사적)

```
otherPensionAt(age) = age >= otherStartAge
    ? (indexed ? Q0 * (1+i)**(age-currentAge) : Q0)
    : 0
```
사적연금은 기본 비연동(`indexed = false`)이며, 이 경우 실질가치가 시간이 갈수록 하락하는 것이 결과에 반영되어야 합니다.

---

## 6. 경제적 자유 필요자산 (`src/calc/fire.ts`) — R3

원안 2번. 인출률 방식과 소진형을 모두 계산합니다.

### 6.1 필요 세후 순액

```
annualSpendAtRetirement = C0 * 12 * (1 + i) ** Y
annualPensionNetAtRetirement = pensionNetAt(retireAge) * 12   // 세후·건보료 차감 후
netNeededFromAssets = max(0, annualSpendAtRetirement - annualPensionNetAtRetirement)
```

### 6.2 Gross-up (세전 필요 인출액 역산) — 검토판 §2.2

인출액에는 세금과 건보료가 붙으므로, 세후 필요액을 그대로 인출률로 나누면 필요자산이 과소 계산됩니다.

```
grossNeeded = solveGross(netNeededFromAssets, accountMix, taxRules, age)
```
`solveGross` 는 인출 세금이 인출액의 비선형 함수(공제·구간세율)이므로 **이분법으로 역산**합니다.
```
findRoot(g => netAfterTaxAndInsurance(g, ...) - netNeededFromAssets,
         lo = netNeeded, hi = netNeeded * 2.5, tol = 1000원, maxIter = 60)
```

### 6.3 인출률 방식 필요자산

```
requiredAssetsNominal(w) = grossNeeded / w
requiredAssetsReal(w)    = requiredAssetsNominal(w) / (1 + i) ** Y
monthlyWithdrawGross(w)  = requiredAssetsNominal(w) * w / 12
```

비교 대상: `w ∈ {0.03, 0.035, 0.04, userRate}`.

### 6.4 계획 소진형 필요자산

실질 기준으로 계산합니다(생활수준 유지 = 실질 정액 인출).

```
rr = realReturn(r_ret, i)                    // 은퇴 후 실질 수익률
R  = grossNeededReal                          // 오늘 구매력 기준 연 필요 세전액
                                              // = grossNeeded / (1+i)^Y

// 실질 연금현가 (연초 인출 = annuity-due)
if (abs(rr) < 1e-9):
  pvReal = R * n
else:
  pvReal = R * (1 - (1 + rr) ** -n) / rr * (1 + rr)

requiredAssetsNominal_depletion = pvReal * (1 + i) ** Y
```

`rr < 0` (은퇴 후 수익률 < 물가상승률)일 때도 위 식은 유효하며 필요자산이 커집니다. `rr = -1` 근처는 입력 검증에서 차단합니다.

### 6.5 달성률

```
achievementByAsset  = finalBalanceNominal / requiredAssetsNominal(w)
achievementBySpend  = (realMonthlyNetSpendable + realMonthlyPensionNet) / C0
```
UI 주 지표는 `achievementBySpend` (검토판 §2.16).

---

## 7. 은퇴 후 인출 시뮬레이션 (`src/calc/withdraw.ts`) — R4

### 7.1 연 단위 루프

세금은 연 단위 과세이므로 **연 단위 루프**로 계산하고, 월 표시액은 연액 ÷ 12 로 제시합니다.

```
for age = retireAge to endAge:
  1. grossWithdrawal = strategyAmount(strategy, age, state)     // §7.2
  2. sources = selectSources(age, withdrawalPriority)           // §7.3
  3. withdrawn = drawFrom(sources, grossWithdrawal)             // 계좌별 실제 인출
  4. tax = taxOnWithdrawal(withdrawn, age, taxRules)            // 03 문서
  5. insurance = healthInsurance(income(age), taxRules)         // §7.4
  6. netIncome = sum(withdrawn) + pensionGross(age) - tax - insurance
  7. balances *= (1 + r_ret)                                    // 연말 성장
  8. record YearlyWithdrawalRow
  9. if all balances <= 0: depletionAge = age; break
```

**성장 시점:** 인출을 연초에 하고 남은 잔액이 1년간 성장하는 것으로 모델링합니다(보수적). 이 선택을 가정 패널에 명시합니다.

### 7.2 전략별 인출액 (검토판 §2.1)

```
① 고정 실질 인출 (fixed-real)
   base = assetsAtRetirement * w
   amount(age) = base * (1 + i) ** (age - retireAge)
   // 잔액과 무관 → 고갈 가능. 잔액 부족 시 잔액 전액 인출 후 고갈 처리

② 고정 비율 인출 (fixed-percent)
   amount(age) = currentBalance * w
   // 고갈 불가

③ 계획 소진형 (depletion)
   // 은퇴 시점에 한 번 산정, 이후 물가연동
   rrRet = realReturn(r_ret, i)
   realAmount = assetsAtRetirementReal * rrRet / (1 - (1+rrRet)**-n) / (1+rrRet)
   amount(age) = realAmount * (1 + i) ** (age - currentAge)
   // n = endAge - retireAge

④ 매년 재계산 (vpw)
   remainingYears = endAge - age + 1
   amount(age) = currentBalance * rrRet / (1 - (1+rrRet)**-remainingYears) / (1+rrRet)
   // 매년 잔여자산·잔여기간으로 재산정 → 고갈 거의 없음
```

`rrRet ≈ 0` 인 경우 ③④는 `currentBalance / remainingYears` 로 폴백합니다.

### 7.3 인출 재원 제약 (검토판 §2.4, §2.12)

**연령 제약 (강제):**
```
age <  55  → 일반계좌, ISA만 (연금저축·IRP 접근 불가)
age >= 55  → 전 계좌 (단 연금계좌는 연금수령한도 적용)
```

ISA는 의무가입기간(3년) 미충족 시 혜택 상실 → 은퇴 시점이 ISA 개설 후 3년 미만이면 경고.

**연금수령한도** (연금계좌를 한 해에 과도하게 빼면 연금소득세가 아닌 기타소득세 적용):
```
연금수령한도 = 평가액 / (11 - 연금수령연차) * 1.2
```
한도 초과분은 기타소득세율(16.5%)로 과세합니다. 데이터 파일에서 계수를 주입합니다.

**기본 인출 우선순위:** `일반계좌 → ISA → 연금저축 → IRP`
과세이연 혜택이 큰 계좌를 최대한 늦게 소진합니다. 사용자 변경 가능.

### 7.4 건강보험료 근사 (검토판 §2.3)

3가지 모드:

```
모드 A (미반영):        insurance = 0
모드 B (요율 근사, 기본): insurance = max(minPremium, assessableIncome * combinedRate)
모드 C (정액 입력):      insurance = userMonthlyAmount * 12
```

`combinedRate` = 건강보험료율 × (1 + 장기요양보험료율 비중)
2026년: `0.0719 × 1.1314 = 0.08134` — 데이터 파일에서 주입.

`assessableIncome` 근사:
- 공적연금 소득: 연금소득의 50%를 소득으로 인정 (지역가입자 기준 근사)
- 사적연금(연금저축·IRP) 인출: 건보료 부과 대상 아님 (현행)
- 금융소득: 연 1,000만원 초과 시 전액 소득에 포함
- 재산 보험료: **모델링하지 않음** — 과소 추정임을 UI에 명시

이 근사는 실제 부과체계를 단순화한 것입니다. `status: "approximation"` 으로 표시하고, "실제 건강보험료는 재산·자동차 등에 따라 더 커질 수 있습니다"를 상시 고지합니다.

### 7.5 결과

```
withdraw(...) → {
  rows: YearlyWithdrawalRow[]
  phases: PhaseSummary[]                  // 브리지1 / 브리지2 / 연금수령기
  firstYearMonthlyGross: number
  firstYearMonthlyNet: number
  firstYearMonthlyNetReal: number         // ← Hero Metric
  depletionAge: number | null
  totalTaxPaid: number
  totalInsurancePaid: number
  byWithdrawalRate: Record<'3%'|'3.5%'|'4%'|'custom', { monthlyNet, monthlyNetReal }>
}
```

### 7.6 구간(Phase) 분할 — 검토판 §2.4

```
phases = [
  { name: '브리지 1', from: retireAge, to: min(54, endAge), sources: ['taxable','isa'] },
  { name: '브리지 2', from: 55, to: pensionStartAge - 1, sources: [...all] },
  { name: hasPensionIncome ? '연금 수령기' : '자산 인출기',
    from: pensionStartAge, to: endAge, sources: [...all] },
].filter(p => p.from <= p.to)
```
은퇴 나이가 55세 이상이면 브리지 1이 자동 제거됩니다.

**연금소득이 없을 때의 이름 (구현 시 발견):** 국민연금·기타연금 입력이 모두 0이면 `pensionStartAge = retireAge` 가 되어 마지막 구간이 전체 은퇴 기간을 덮습니다. 이때 이 구간을 '연금 수령기'라고 부르면 **사실과 다릅니다**(연금이 없음). 따라서 연금소득이 하나라도 있을 때만 '연금 수령기'라는 이름을 쓰고, 없으면 **'자산 인출기'** 로 부르며 "국민연금 예상 수령액을 입력하면 결과가 크게 달라집니다"를 안내로 붙입니다.

`pensionStartAge` 는 국민연금과 기타연금 중 **먼저 개시되는 쪽**을 씁니다.

---

## 8. 역산 솔버 (`src/calc/solve.ts`) — R9

전부 **단조 함수에 대한 이분법**으로 구현합니다(뉴턴법은 발산 위험).

```ts
function bisect(f: (x: number) => number, lo: number, hi: number,
                tol: number, maxIter = 80): number
```

| 솔버 | 목적 함수 | 탐색 범위 | 허용 오차 |
|---|---|---|---|
| 필요 월 납입액 | `achievement(contribution) - 1` | 0 ~ 5,000만원 | 1,000원 |
| 필요 연 수익률 | `achievement(r) - 1` | -0.05 ~ 0.30 | 0.0001 |
| 최단 은퇴 나이 | `achievement(retireAge) - 1` | 현재나이+1 ~ 85 (정수 탐색) | 1년 |

**단조성 보장:** 세금·한도 배분 때문에 미세한 비단조 구간이 생길 수 있습니다. 해가 없으면 `null` 을 반환하고 UI는 "이 조건으로는 목표 달성이 불가능합니다"를 표시합니다. 은퇴 나이 솔버는 정수 탐색이므로 선형 스캔으로 충분합니다.

---

## 9. 시나리오 비교 (`src/calc/scenario.ts`) — R8

```
scenarios = [
  { key: 'conservative', rOffset: -0.02, iOffset: +0.005 },
  { key: 'base',         rOffset:  0,    iOffset:  0     },
  { key: 'optimistic',   rOffset: +0.02, iOffset:  0     },
]
```
각 시나리오에 대해 `runFullSimulation` 을 독립 실행합니다. 오프셋 적용 시 `p` 를 조정하고 `d` 는 유지합니다(배당수익률은 상대적으로 안정적).

---

## 10. Monte Carlo + SORR (`src/calc/montecarlo.ts`) — R8, M6

### 10.1 원칙

- **시드 PRNG 필수** (`src/lib/prng.ts`, xorshift128+ 또는 mulberry32). `Math.random()` 금지 — 재현성 없음.
- Web Worker에서 실행. 메인 스레드 블로킹 금지.
- 진행률을 500ms 간격으로 postMessage.

### 10.2 수익률 생성 모델 (2종)

**모델 1: 로그정규 (기본)**
```
// 연 수익률의 로그가 정규분포
mu    = ln(1 + r)                       // 중위값·기하평균이 r 이 되도록 설정
z     = gaussian(prng)                  // Box-Muller
yearReturn = exp(mu + sigma * z) - 1
```
`sigma` 기본값 0.15.

**`mu` 설정 근거:** 사용자가 입력하는 "예상 연평균 수익률"은 CAGR(기하평균)입니다. 로그정규분포에서 기하평균 = 중위값 = `exp(mu)` 이므로 `mu = ln(1+r)` 이 올바른 대응입니다. 이때 산술평균은 `exp(mu + σ²/2) − 1` 로 입력값보다 높아지는데, 이는 변동성이 있는 자산의 실제 특성과 일치합니다.

`mu = ln(1+r) − σ²/2` 로 두면 *산술평균*이 r 이 되고 기하평균(=사용자가 입력한 의미)이 입력값보다 낮아지므로 사용하지 않습니다. 어느 쪽이든 보정을 완전히 빼먹으면 안 됩니다 — 흔한 버그.

축적기와 인출기는 기대수익률이 다르므로(은퇴 후 자산배분 보수화) 각각 `totalReturn` 과 `retirementReturn` 을 평균으로 하는 경로를 생성합니다. 변동성은 동일하게 적용하며, 이는 단순화임을 가정 패널에 명시합니다.

**모델 2: 블록 부트스트랩**
```
// 과거 연 수익률 배열에서 5년 블록을 무작위 복원추출
// 자기상관(연속 하락장)을 보존 → SORR을 더 현실적으로 반영
```
과거 데이터는 `src/data/history/` 에 두고 출처·기간을 명시합니다. MVP에서는 모델 1만 구현하고 모델 2용 인터페이스만 열어둡니다.

### 10.3 실행

```
for trial in 1..trials:
  path = generateReturns(Y + n, model, prng)
  accResult  = accumulate(input, taxRules, returnsOverride = path[0..Y])
  wdResult   = withdraw(accResult, input, taxRules, returnsOverride = path[Y..])
  record { finalBalance, depletionAge, firstYearNetReal, first10YearReturns }
```

**핵심 설계:** `accumulate()` 와 `withdraw()` 는 연도별 수익률 배열을 **선택적으로 주입받을 수 있어야 합니다**(`returnsOverride?: number[]`). 이것이 원안 129행 "SORR을 반영할 수 있는 구조"의 실체입니다. 결정론적 계산은 상수 배열을 주입한 특수 케이스입니다.

### 10.4 결과 지표

```ts
interface MonteCarloResult {
  trials: number
  successRate: number                 // P(자산 > 0 at endAge)
  percentilePaths: Record<10|25|50|75|90, number[]>   // 연도별 자산
  depletionAgeHistogram: { age: number; count: number }[]
  medianFinalBalance: number

  // SORR 분석 (검토판 §2.13)
  sorr: {
    // 은퇴 직후 10년 누적수익률 하위 10% 경로들
    worstSequenceSuccessRate: number
    worstSequenceMedianDepletionAge: number
    // 동일 기하평균 대비 얼마나 악화되는지
    deterministicComparisonNote: string
  }
}
```

### 10.5 성능 목표

10,000 trials × (30년 축적 × 12개월 + 40년 인출) ≈ 4.4M 스텝. 목표 3초 이내.
- 계좌별 객체 생성 금지 → 타입드 배열(`Float64Array`)로 상태 관리
- 인출기는 연 단위이므로 부담 적음
- 축적기 월 루프가 병목 → MC에서는 **연 단위 근사 옵션** 제공 (정확도 손실 명시)

---

## 11. 전체 오케스트레이션 (`src/calc/index.ts`)

```ts
function runFullSimulation(
  input: CalculatorInput,
  taxRules: TaxRuleSet,
  options?: { returnsOverride?: number[] }
): CalculationResult
```

순서는 `design/README.md` §4 의 파이프라인과 동일합니다. 반환 객체에는 **반드시** `assumptions: Assumption[]` 이 포함됩니다 (CLAUDE.md R-8).

```ts
interface Assumption {
  label: string           // '연평균 총수익률'
  value: string           // '7.00%'
  derivation?: string     // '(1.07 × (1-0.0015)) - 1 = 6.84%'
  source?: string         // URL
  asOf?: string           // '2026-08-08'
  status?: 'confirmed' | 'proposed' | 'needs-verification' | 'approximation'
}
```

---

## 12. 수치 안정성 주의사항

| 위험 | 대응 |
|---|---|
| `(1+r)**(1/12)` 에서 `r <= -1` | 입력 검증에서 `r > -0.99` 강제 |
| `rr = 0` 근처 연금현가 나눗셈 | `abs(rr) < 1e-9` 분기 처리 |
| 잔액이 음수로 진입 | 매 스텝 `max(0, balance)` 클램프 + 고갈 플래그 |
| float64 정밀도 | 원 단위 정수 표현은 2^53까지 정확 → 9,000조원까지 안전. 문제 없음 |
| 이분법 미수렴 | `maxIter` 도달 시 `null` 반환, UI에서 "계산 불가" 처리 |
| 100년 × 12개월 누적 오차 | 중간 반올림 금지로 충분 (CLAUDE.md R-5) |
