# 06. 아키텍처 · 기술 설계

대응 요구사항: R12(비기능 요구사항)

---

## 1. 아키텍처 결정 기록 (ADR)

### ADR-1. 백엔드 없음 (완전 클라이언트 사이드)
**결정:** 정적 사이트로 배포하고 서버를 두지 않는다.
**근거:** 소득·자산 등 민감 정보를 다룹니다. 서버가 없으면 유출될 데이터가 없습니다(CLAUDE.md R-7). 계산은 전부 브라우저에서 밀리초 단위로 끝나므로 서버 연산이 불필요합니다.
**대가:** 사용자 계정·서버 저장 시나리오 비교가 불가능 → URL·localStorage로 대체.

### ADR-2. 계산 엔진과 UI의 완전 분리
**결정:** `src/calc/` 는 React·DOM·전역 상태를 전혀 모른다.
**근거:** 금융 계산은 단위 테스트로만 검증할 수 있습니다. UI에 얽히면 테스트가 불가능해지고, 나중에 Worker로 옮길 수도 없습니다.
**강제:** ESLint `no-restricted-imports` 로 `src/calc/**` 에서 `react`·`zustand`·`recharts` import를 금지합니다.

### ADR-3. 세율은 데이터, 코드가 아니다
**결정:** 모든 제도 수치는 `src/data/tax/kr-YYYY.ts` 에만 존재하며 계산 함수는 인자로 받는다.
**근거:** 원안 109행의 요구. 세법은 매년 바뀌고, 갱신 지점이 한 곳이어야 실수가 없습니다.
**강제:** ESLint 커스텀 룰 또는 CI 스크립트로 `src/calc/**` 내 세율성 리터럴을 검출합니다 (§5).

### ADR-4. 수익률 배열 주입 가능 구조
**결정:** `accumulate()`·`withdraw()` 는 `returnsOverride?: number[]` 를 받는다.
**근거:** 원안 127·129행(Monte Carlo, SORR)을 나중에 붙일 때 엔진을 재작성하지 않기 위한 유일한 설계입니다. 결정론적 계산은 상수 배열을 주입한 특수 케이스가 됩니다.

### ADR-5. Monte Carlo는 Web Worker, 시드 PRNG
**결정:** `Math.random()` 을 쓰지 않고 시드 기반 PRNG를 주입한다.
**근거:** 같은 입력에 같은 결과가 나와야 합니다. 버그 재현과 테스트가 불가능해지는 것을 막습니다.

### ADR-6. 상태는 하나의 입력 객체
**결정:** `CalculatorInput` 단일 객체를 Zustand에 두고, 결과는 파생값으로 계산한다.
**근거:** 직렬화(URL·localStorage)와 마이그레이션이 단순해집니다. 결과를 상태에 저장하지 않으므로 입력과 결과가 불일치할 수 없습니다.

---

## 2. 폴더 구조

```
src/
├── main.tsx
├── App.tsx
│
├── calc/                        ← 🔒 순수 계산 엔진 (React 금지)
│   ├── index.ts                 runFullSimulation()
│   ├── types.ts                 입출력 타입 전체
│   ├── rates.ts                 연↔월, 명목↔실질 변환
│   ├── allocate.ts              계좌 배분 + 오버플로
│   ├── accumulate.ts            축적기 월별 시뮬레이션
│   ├── spending.ts              목표 생활비 환산
│   ├── pension.ts               국민연금·기타연금 모델
│   ├── withdraw.ts              인출기 시뮬레이션 (전략 4종)
│   ├── fire.ts                  필요자산 계산 + 인출률 비교
│   ├── solve.ts                 이분법 솔버
│   ├── scenario.ts              3시나리오
│   ├── montecarlo.ts            MC + SORR
│   ├── assumptions.ts           Assumption[] 조립
│   ├── warnings.ts              Warning[] 판정
│   └── tax/
│       ├── accumulation.ts      축적기 과세
│       ├── withdrawal.ts        인출기 과세 (계좌별)
│       ├── insurance.ts         건강보험료 근사
│       └── grossup.ts           세전 인출액 역산
│
├── data/
│   ├── tax/
│   │   ├── types.ts             TaxRuleSet, Sourced<T>
│   │   ├── kr-2026.ts           2026년 룰셋 (출처·기준일 필수)
│   │   └── index.ts             레지스트리 + 개정안 토글 + 오버라이드
│   └── history/                 (M6) 과거 수익률 데이터 + 출처
│
├── store/
│   ├── calculator.ts            Zustand 스토어
│   └── selectors.ts             파생 계산 (메모이제이션)
│
├── lib/
│   ├── format.ts                formatKRW, formatPercent
│   ├── schema.ts                Zod 스키마 + 마이그레이션
│   ├── defaults.ts              DEFAULT_INPUT + 근거 주석
│   ├── url-codec.ts             압축 인코딩
│   ├── prng.ts                  mulberry32 등 시드 PRNG
│   └── bisect.ts                이분법 유틸
│
├── components/                  ← 재사용 UI 프리미티브
│   ├── inputs/                  MoneyInput, RateSlider, PriorityList ...
│   ├── display/                 MetricCard, Gauge, StatusBadge ...
│   ├── charts/                  AssetGrowthChart, FanChart ...
│   └── layout/
│
├── features/                    ← 화면 단위 조립
│   ├── input-panel/             섹션 5개
│   ├── result-dashboard/        핵심 지표 + 카드
│   ├── withdrawal-table/        인출률 비교 + 구간별 현금흐름
│   ├── yearly-detail/           연도별 상세 표 + CSV
│   ├── assumptions-panel/       가정 패널 + 계산식 팝오버
│   ├── scenario-compare/        (M5)
│   ├── solver/                  (M5)
│   └── monte-carlo/             (M6)
│
└── workers/
    └── montecarlo.worker.ts
```

**의존 방향 (단방향, 역류 금지)**
```
features → components → lib
   ↓          ↓
 store  →   calc   →   data
```
`calc` 는 `data` 의 **타입만** 알고, 특정 룰셋 파일을 import하지 않습니다. 룰셋은 항상 인자로 주입됩니다.

---

## 3. 성능 목표와 전략

| 작업 | 목표 | 전략 |
|---|---|---|
| 기본 계산 (30년 축적 + 40년 인출) | < 50ms | 순수 JS 루프. 최적화 불필요 |
| 슬라이더 드래그 중 재계산 | 60fps 유지 | `requestAnimationFrame` 스로틀 |
| 3시나리오 동시 계산 | < 150ms | 순차 실행으로 충분 |
| 솔버 (이분법 80회) | < 500ms | 각 반복이 전체 시뮬레이션 → 반복 상한 관리 |
| Monte Carlo 10,000회 | < 3s | Web Worker + `Float64Array` + 객체 생성 최소화 |
| 초기 로드 (JS) | < 200KB gzip | 코드 스플리팅: MC·솔버는 동적 import |
| LCP | < 1.5s | 정적 호스팅 + 폰트 self-host + 프리로드 |

### Monte Carlo 최적화 원칙
```ts
// ❌ 객체를 매 스텝 생성 — 10,000 × 840 스텝에서 GC 폭발
const state = { balance: 0, costBasis: 0 }

// ✅ 타입드 배열에 평평하게 저장
const balances = new Float64Array(ACCOUNT_COUNT)
const costBases = new Float64Array(ACCOUNT_COUNT)
```
결과 경로 저장도 `Float64Array(trials × years)` 한 덩어리로 할당하고, 백분위는 정렬 대신 **부분 선택(quickselect)** 으로 구합니다.

MC에서 축적기를 연 단위로 근사하는 옵션을 제공하되(속도 12배), 기본은 월 단위이며 근사 사용 시 UI에 표시합니다.

---

## 4. Web Worker 프로토콜

```ts
// 메인 → 워커
type WorkerRequest =
  | { type: 'run'; input: CalculatorInput; rules: TaxRuleSet }
  | { type: 'cancel' }

// 워커 → 메인
type WorkerResponse =
  | { type: 'progress'; completed: number; total: number }   // 500ms 간격
  | { type: 'done'; result: MonteCarloResult }
  | { type: 'error'; message: string }
```

- `TaxRuleSet` 은 순수 데이터이므로 구조화 복제로 그대로 전달 가능합니다.
- 취소는 워커 내부 루프에서 플래그를 확인하는 방식(1,000회마다). `terminate()` 는 마지막 수단.
- 워커는 지연 생성하고, 유휴 30초 후 종료합니다.

---

## 5. 품질 게이트 (CI)

```bash
npm run typecheck      # tsc --noEmit
npm run lint           # ESLint
npm run test           # Vitest (계산 엔진 + 골든)
npm run check:tax      # 세율 하드코딩 검출 (커스텀 스크립트)
npm run build          # 번들 크기 예산 검사 포함
```

### `check:tax` 스크립트
`src/calc/**` 를 스캔해 아래 패턴을 찾으면 실패합니다.

```
0.154 | 0.099 | 0.165 | 0.132 | 0.22 | 0.055 | 0.044 | 0.033
2_000_000 | 2500000 | 15_000_000 | 40_000_000 | 9_000_000 | 6_000_000 | 18_000_000
```
정당한 예외는 `// tax-literal-ok: <이유>` 주석으로 허용합니다. 이 게이트가 ADR-3을 실제로 강제하는 장치입니다.

### ESLint 핵심 룰
```js
// src/calc/** 와 src/data/**
'no-restricted-imports': ['error', {
  patterns: ['react', 'react-*', 'zustand', 'recharts', '@/components/*', '@/store/*']
}]
// 전역
'@typescript-eslint/no-explicit-any': 'error'
'@typescript-eslint/no-floating-promises': 'error'
```

### 번들 예산
Recharts 가 gzip 약 116KB 로 전체의 절반을 차지하므로 **차트를 지연 로딩으로 분리**합니다. 핵심 지표는 차트 없이도 즉시 보이므로 사용자 체감 손실이 없습니다.

| 청크 | 상한 (gzip) |
|---|---|
| 초기 JS (엔진 + UI) | 160KB |
| 초기 CSS | 20KB |
| 차트 청크 (지연 로딩) | 130KB |
| Monte Carlo 워커 | 30KB |

`scripts/check-bundle.mjs` 가 `npm run build` 마지막 단계에서 이 예산을 강제합니다.

---

## 6. 프라이버시 · 보안

| 항목 | 조치 |
|---|---|
| 서버 전송 | 없음. `fetch`/`XMLHttpRequest` 사용 금지 (ESLint 룰) |
| 외부 리소스 | 폰트·아이콘 self-host. CDN 사용 금지 |
| 애널리틱스 | 도입 시 **입력값·결과값 전송 금지**. 페이지뷰만 |
| localStorage | 사용자 명시 동의 없이도 저장하되, "저장된 데이터 삭제" 버튼 제공 |
| URL 공유 | 금액이 포함된다는 경고를 공유 직전 표시 |
| CSP | `default-src 'self'; connect-src 'none'; script-src 'self'` |
| 에러 리포팅 | 도입 시 입력값 스크러빙 필수 |

`connect-src 'none'` CSP는 "서버로 데이터를 보내지 않는다"를 브라우저 수준에서 강제하는 장치입니다. 실수로 fetch 코드가 들어가도 차단됩니다.

---

## 7. 빌드 · 배포

```
Vite 6 + TypeScript strict
  ↓ npm run build
정적 산출물 (dist/)
  ↓
정적 호스팅 (Vercel / GitHub Pages / Cloudflare Pages)
```

- SPA 라우팅 불필요 (단일 페이지) → 서버 리라이트 설정 최소화
- `base` 경로는 환경변수로 (GitHub Pages 서브경로 대응)
- 빌드 시 `__BUILD_DATE__`·`__TAX_RULESET_ID__`·`__TAX_AS_OF__` 를 주입해 푸터에 표시
- 캐시: 해시 파일명 + `index.html` no-cache

### 세제 기준일 표시
푸터에 빌드 시점의 룰셋 기준일을 항상 표시합니다.
```
세제 기준일 2026-08-08 · 빌드 2026-08-08
```
사용자가 오래된 배포를 보고 있는지 스스로 판단할 수 있게 하는 유일한 장치입니다.

---

## 8. 브라우저 지원

| 브라우저 | 버전 |
|---|---|
| Chrome / Edge | 최신 2개 |
| Safari | 16+ (iOS 16+) |
| Firefox | 최신 2개 |

- `CompressionStream` 미지원 브라우저(구형 Safari)는 URL 공유에서 **압축 없는 base64 폴백**을 사용합니다.
- Web Worker·`Float64Array` 는 전 대상에서 지원됩니다.
- IE는 지원하지 않습니다.

---

## 9. 로깅 · 진단

프로덕션에서 사용자 데이터를 로깅하지 않습니다. 개발 편의를 위해:

```ts
// 개발 빌드에서만 활성
if (import.meta.env.DEV) {
  console.table(result.assumptions)
  console.log('warnings', result.warnings)
}
```

URL에 `?debug=1` 이 있으면 계산 중간값(월별 배열)을 화면 하단에 표로 덤프합니다. 이 기능은 프로덕션에도 남겨둡니다 — 사용자가 결과를 의심할 때 검증할 수 있는 경로가 되고, 이는 제품 원칙 "가정은 항상 보인다"의 연장입니다.

---

## 10. 향후 확장 여지 (구조만 열어둠)

| 확장 | 필요 변경 |
|---|---|
| 과거 수익률 블록 부트스트랩 | `data/history/` 추가, `montecarlo.ts` 모델 분기 |
| 환율 시나리오 | `ReturnAssumptions` 에 환율 필드, `accumulate()` 에 통화 차원 추가 |
| 자산배분 (주식/채권 비율 변화) | 수익률을 단일 값에서 자산군 배열로 확장 — 가장 큰 구조 변경 |
| 가드레일 인출 전략 (Guyton-Klinger) | `withdraw.ts` 에 전략 추가 (전략이 이미 플러그형) |
| 부부 합산 계획 | `CalculatorInput` 을 인물 배열로 — schemaVersion 상승 필요 |
| 다른 국가 세제 | `TaxRuleSet` 이 이미 국가 중립적 구조 → 룰셋 추가로 가능 |

**지금 하지 말아야 할 것:** 위 확장을 위한 추상화를 미리 만들지 않습니다. 특히 자산배분 다차원화는 MVP 코드를 크게 복잡하게 만들므로, 실제로 필요해질 때 리팩터링합니다.
