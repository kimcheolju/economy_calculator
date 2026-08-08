# 경제적 자유 계산기

대한민국 거주자를 위한 **ETF 장기투자 + 은퇴 시뮬레이터**. 완전 클라이언트 사이드 웹앱.

> 사용자에게 답하는 단 하나의 질문:
> **"지금 계획대로 투자하면 은퇴 후 오늘 돈 가치로 매달 얼마를 쓸 수 있는가?"**

입력한 정보는 브라우저를 벗어나지 않습니다. 서버가 없고 외부 통신도 하지 않습니다.

---

## 실행

```bash
npm install
npm run dev        # http://localhost:5173
```

## 검증

```bash
npm run verify     # typecheck + check:tax + test  (커밋 전 실행)
npm run test       # 235개 테스트 (골든 / 속성 / 단위 / 데이터 구조)
npm run typecheck
npm run lint
npm run check:tax  # 계산 엔진에 세율이 하드코딩되지 않았는지 검사
npm run build      # 프로덕션 빌드 + 번들 예산 검사 → dist/
```

## 빌드 결과 보기

```bash
npm run build && npm run preview   # dist/ 를 http://localhost:4173 로 서빙
npm run build:local                # dist-local/index.html 한 파일 — 더블클릭으로 열림
```

`dist/index.html` 을 파일 탐색기에서 직접 열면 **흰 화면**이 나옵니다. 절대경로 애셋, module script 의 CORS 제한, CSP `'self'` 가 `file://` 에서 동시에 막기 때문이며 정상 동작입니다. 서버 없이 확인하려면 `build:local` 로 만든 단일 파일을 쓰세요.

기본값 시나리오의 전체 요약을 눈으로 확인하려면:

```bash
SMOKE_VERBOSE=1 npx vitest run tests/smoke.test.ts
```

---

## 무엇을 계산하는가

| 기능 | 설명 |
|---|---|
| 축적기 시뮬레이션 | 월 단위 적립, 계좌별 과세, ETF 총보수, 배당 재투자, 세액공제 환급금 재투자 |
| 계좌 포트폴리오 | 일반계좌 / ISA / 연금저축 / IRP / DC·퇴직금 — 납입한도에 따른 자동 오버플로 배분 |
| 명목 / 실질 병기 | 모든 금액을 오늘 구매력 기준과 함께 표시 |
| 경제적 자유 필요자산 | 3% / 3.5% / 4% / 사용자 지정 / 계획 소진형 비교, 세전 인출액 역산(gross-up) |
| 인출 전략 4종 | 고정 실질 · 고정 비율 · 계획 소진 · 매년 재계산(VPW) |
| 구간별 현금흐름 | 브리지 1(55세 전) / 브리지 2 / 연금 수령기 — 연금계좌 55세 제약 강제 |
| 세금 · 건강보험료 | 축적기 배당 원천징수, 인출기 계좌별 과세, 지역가입자 건보료 근사 |
| 공적연금 | 국민연금 물가연동, 조기·연기 수령 조정 |
| 시나리오 비교 | 보수 / 기준 / 낙관 |
| 역산 솔버 | 필요 월 납입액 · 필요 수익률 · 가장 이른 은퇴 나이 |
| Monte Carlo + SORR | 성공확률, 백분위 경로, 고갈 나이 분포, 은퇴 초기 하락장 위험 |
| 투명성 | 가정 42개를 출처·기준일·확정여부와 함께 노출, 계산식 공개 |

---

## 문서

| 문서 | 내용 |
|---|---|
| [`CLAUDE.md`](./CLAUDE.md) | 개발 지침 — 절대 규칙 9개, 계산 규약, 세제 데이터 갱신 절차 |
| [`plan/design-review-v2.md`](./plan/design-review-v2.md) | 요구사항 (원안 검토 + 보완) |
| [`design/`](./design/README.md) | 상세 설계 — 기능·계산엔진·세제·데이터모델·UI·아키텍처·테스트 |

**구현 전에 해당 `design/` 문서를 읽으세요.** 설계와 다르게 구현해야 한다면 먼저 설계 문서를 수정합니다.

---

## 구조

```
src/
├── calc/     🔒 순수 계산 엔진 (React·DOM 의존 0, 세율을 모름)
├── data/tax/ 🔒 버전드 제도 데이터 (출처·기준일·확정여부 필수)
├── lib/      포맷·검증·URL 인코딩·PRNG·이분법
├── store/    Zustand 입력 스토어 + 파생 계산 훅
├── components/ UI 프리미티브 (입력·표시·차트)
├── features/ 화면 단위 조립
└── workers/  Monte Carlo Web Worker
```

의존 방향은 단방향입니다: `features → components → lib`, `store → calc → data`.
ESLint 가 `src/calc/**` 에서 React·Zustand·Recharts import 를 차단합니다.

---

## 핵심 규칙 (자세한 내용은 CLAUDE.md)

1. 명목/실질을 절대 섞지 않는다 (`Money { nominal, real }`)
2. 세율을 코드에 하드코딩하지 않는다 (`src/data/tax/` 에만, `check:tax` 로 강제)
3. 모든 제도 수치에 출처·기준일·확정여부를 붙인다
4. 계산 엔진은 순수 함수 (`Date.now()`·`Math.random()` 금지)
5. 중간 계산에서 반올림하지 않는다
6. 연→월 변환은 기하평균, 실질수익률은 Fisher 정확식
7. 사용자 데이터는 네트워크로 나가지 않는다
8. 결과에는 항상 가정이 따라간다
9. 확신 없는 세법은 `needs-verification` 으로 표시한다

---

## 세제 기준

**2026-08-08 기준**으로 조사한 대한민국 제도를 반영했습니다 (`src/data/tax/kr-2026.ts`).
세법이 바뀌면 이 파일을 수정하지 말고 `kr-2027.ts` 를 새로 만드세요.

ISA 비과세 한도는 자료 간 상충이 있어 `needs-verification` 으로 표시하고 현행값(일반형 200만원)을
보수적으로 적용했습니다. 2026 세제개편안(상향안)은 `proposed` 로 분리해 토글로만 적용됩니다.

---

## 면책

이 계산기는 정보 제공 목적이며 **투자 권유가 아닙니다**. 세금·연금·건강보험료 계산은 참고용 근사이며
실제 금액과 다를 수 있습니다. 알려진 한계는 앱의 가정 패널과
[`design/03-tax-and-accounts.md`](./design/03-tax-and-accounts.md) §9 에 전부 명시되어 있습니다.
