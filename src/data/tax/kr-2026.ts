import type { TaxRuleSet } from './types'

const NTS = 'https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?mi=6608&cntntsId=7888'
const KB_ETF = 'https://kbthink.com/etf/etf-tax.html'
const KB_TAX_2026 = 'https://kbthink.com/tax/expert/gw/251230.html'
const KB_FIT = 'https://kbthink.com/main/asset-management/wealth-manage-tip/kbthink-original/202408/financial_investment_income_tax.html'
const PWC = 'https://www.pwc.com/kr/ko/insights/issue-brief/one-point-tax-11.html'
const SAMSUNG_PENSION = 'https://www.samsungpop.com/mbw/o2Info/contents.do?cmd=detail&boardId=1398&isEbd=Y'
const MOHW_PENSION = 'https://www.mohw.go.kr/board.es?mid=a10503000000&bid=0027&list_no=1485039&act=view'
const NPS_2026 = 'https://www.nps.or.kr/pnsgdnc/newgdnc/getOHAE0001M1.do?pstId=ZZ202600000000000147'
const MOHW_LTC = 'https://www.mohw.go.kr/board.es?mid=a10503010100&bid=0027&act=view&list_no=1487817'
const NHIS_2026 = 'https://www.nhis.or.kr/renewal_popup/poster/20260204_poster_longdesc_1.html'
const AJU_2026_REFORM = 'https://www.ajunews.com/view/20260803101556407'
const BOK_TARGET = 'https://www.bok.or.kr/portal/main/contents.do?menuNo=200761'

const AS_OF = '2026-08-08'

/**
 * 대한민국 2026년 기준 세제·연금·건강보험 룰셋.
 *
 * ⚠ 이 파일은 스냅샷입니다. 세법이 바뀌면 이 파일을 수정하지 말고 kr-2027.ts 를 새로 만드세요
 *   (design/03-tax-and-accounts.md §1, CLAUDE.md §6).
 */
export const KR_2026: TaxRuleSet = {
  id: 'kr-2026',
  label: '대한민국 2026년 기준',
  effectiveFrom: '2026-01-01',
  lastReviewed: AS_OF,

  // 소득세 14% + 지방소득세 1.4%
  dividendWithholding: {
    value: { rate: 0.154 },
    source: PWC,
    asOf: AS_OF,
    status: 'confirmed',
  },

  comprehensiveIncomeThreshold: {
    value: { amount: 20_000_000 },
    source: PWC,
    asOf: AS_OF,
    status: 'confirmed',
    note: '금융소득이 이 금액을 초과하면 종합과세 대상. 본 계산기는 경고만 표시하고 누진세를 계산하지 않는다.',
  },

  etf: {
    // 금융투자소득세 폐지(2024-12-10 소득세법 개정)로 국내주식형 ETF 매매차익은 계속 비과세
    domesticEquity: {
      value: { capitalGainsRate: 0, annualDeduction: 0 },
      source: KB_FIT,
      asOf: AS_OF,
      status: 'confirmed',
    },
    // 국내상장 해외/채권/파생형: 매매차익이 '배당소득'이므로 250만원 기본공제가 없다.
    // 해외상장(양도소득)과 혼동하기 쉬운 지점 — design/03 §2.3
    domesticListedForeign: {
      value: { capitalGainsRate: 0.154, annualDeduction: 0 },
      source: KB_ETF,
      asOf: AS_OF,
      status: 'confirmed',
      note: '실제 과세표준은 min(과표기준가 증가분, 실제 매매차익)이나 과표기준가를 모사할 수 없어 매매차익 전액으로 근사(보수적).',
    },
    // 해외상장: 양도소득세 22%(지방세 포함), 연 250만원 기본공제, 분리과세
    foreignListed: {
      value: { capitalGainsRate: 0.22, annualDeduction: 2_500_000 },
      source: KB_ETF,
      asOf: AS_OF,
      status: 'confirmed',
    },
  },

  isa: {
    annualLimit: {
      value: { amount: 40_000_000 },
      source: KB_TAX_2026,
      asOf: AS_OF,
      status: 'confirmed',
    },
    lifetimeLimit: {
      value: { amount: 200_000_000 },
      source: KB_TAX_2026,
      asOf: AS_OF,
      status: 'confirmed',
    },
    // ⚠ 2026 세제개편안(2026-08-03)은 '현행 일반형 200만원 / 서민형 400만원'을 전제로 서술하고 있어
    //   500만원/1,000만원 상향은 미확정 개정안으로 판단. 구현 시 기재부 1차 자료로 재확인 필요.
    exemptGeneral: {
      value: { amount: 2_000_000 },
      source: AJU_2026_REFORM,
      asOf: AS_OF,
      status: 'needs-verification',
      note: '상향안(500만원)은 proposed 블록 참조. 자료 간 상충이 있어 보수적으로 현행값 적용.',
    },
    exemptLowIncome: {
      value: { amount: 4_000_000 },
      source: AJU_2026_REFORM,
      asOf: AS_OF,
      status: 'needs-verification',
    },
    // 비과세 한도 초과분: 9% + 지방소득세 0.9%
    excessRate: {
      value: { rate: 0.099 },
      source: KB_TAX_2026,
      asOf: AS_OF,
      status: 'confirmed',
    },
    minHoldingYears: {
      value: { years: 3 },
      source: KB_TAX_2026,
      asOf: AS_OF,
      status: 'confirmed',
    },
    carryOverUnused: {
      value: { enabled: false },
      source: KB_TAX_2026,
      asOf: AS_OF,
      status: 'approximation',
      note: '한도 이월 규정이 있으나 MVP에서는 미반영(보수적).',
    },
  },

  pensionAccount: {
    // 연금저축 + IRP 합산 납입한도
    combinedAnnualLimit: {
      value: { amount: 18_000_000 },
      source: SAMSUNG_PENSION,
      asOf: AS_OF,
      status: 'confirmed',
    },
    creditLimitSavings: {
      value: { amount: 6_000_000 },
      source: SAMSUNG_PENSION,
      asOf: AS_OF,
      status: 'confirmed',
    },
    creditLimitCombined: {
      value: { amount: 9_000_000 },
      source: SAMSUNG_PENSION,
      asOf: AS_OF,
      status: 'confirmed',
    },
    // 총급여 5,500만원 이하: 15% + 지방세 1.5%
    creditRateLow: {
      value: { rate: 0.165 },
      source: SAMSUNG_PENSION,
      asOf: AS_OF,
      status: 'confirmed',
    },
    // 총급여 5,500만원 초과: 12% + 지방세 1.2%
    creditRateHigh: {
      value: { rate: 0.132 },
      source: SAMSUNG_PENSION,
      asOf: AS_OF,
      status: 'confirmed',
    },
    creditIncomeThreshold: {
      value: { amount: 55_000_000 },
      source: SAMSUNG_PENSION,
      asOf: AS_OF,
      status: 'confirmed',
    },
    // 연금소득세: 55~69세 5.5% / 70~79세 4.4% / 80세 이상 3.3% (지방세 포함)
    withdrawalRates: {
      value: { under70: 0.055, under80: 0.044, over80: 0.033 },
      source: NTS,
      asOf: AS_OF,
      status: 'confirmed',
    },
    separateTaxThreshold: {
      value: { amount: 15_000_000 },
      source: NTS,
      asOf: AS_OF,
      status: 'confirmed',
      note: '사적연금 연 수령액이 이 금액을 초과하면 종합과세 또는 16.5% 분리과세 선택. 본 계산기는 16.5%로 보수적 계산.',
    },
    separateTaxRate: {
      value: { rate: 0.165 },
      source: NTS,
      asOf: AS_OF,
      status: 'confirmed',
    },
    earlyWithdrawalRate: {
      value: { rate: 0.165 },
      source: NTS,
      asOf: AS_OF,
      status: 'confirmed',
      note: '연금수령한도 초과분 및 중도해지 시 기타소득세.',
    },
    // 연금수령한도 = 평가액 / (11 - 연금수령연차) × 1.2
    annualLimitFactor: {
      value: { divisorBase: 11, multiplier: 1.2 },
      source: NTS,
      asOf: AS_OF,
      status: 'confirmed',
    },
    minAge: {
      value: { age: 55 },
      source: NTS,
      asOf: AS_OF,
      status: 'confirmed',
    },
    retirementPensionDiscountWithin10: {
      value: { ratio: 0.7 },
      source: NTS,
      asOf: AS_OF,
      status: 'confirmed',
      note: '퇴직급여를 연금으로 수령 시 퇴직소득세 30% 감면 (수령 10년 이내).',
    },
    retirementPensionDiscountAfter10: {
      value: { ratio: 0.6 },
      source: NTS,
      asOf: AS_OF,
      status: 'confirmed',
    },
  },

  nationalPension: {
    // 2025년 국민연금법 개정: 2026년 9.5%, 매년 0.5%p 인상 → 2033년 13%
    contributionRate: {
      value: { rate: 0.095 },
      source: MOHW_PENSION,
      asOf: AS_OF,
      status: 'confirmed',
    },
    incomeReplacementRate: {
      value: { rate: 0.43 },
      source: MOHW_PENSION,
      asOf: AS_OF,
      status: 'confirmed',
    },
    aValue: {
      value: { amount: 3_193_511 },
      source: NPS_2026,
      asOf: AS_OF,
      status: 'confirmed',
    },
    incomeCeiling: {
      value: { amount: 6_590_000 },
      source: NPS_2026,
      asOf: AS_OF,
      status: 'confirmed',
    },
    incomeFloor: {
      value: { amount: 410_000 },
      source: NPS_2026,
      asOf: AS_OF,
      status: 'confirmed',
    },
    // 조기수령: 월 0.5% = 연 6% 감액 (최대 5년)
    earlyReductionPerYear: {
      value: { rate: 0.06 },
      source: MOHW_PENSION,
      asOf: AS_OF,
      status: 'confirmed',
    },
    // 연기수령: 월 0.6% = 연 7.2% 증액 (최대 5년)
    deferralBonusPerYear: {
      value: { rate: 0.072 },
      source: MOHW_PENSION,
      asOf: AS_OF,
      status: 'confirmed',
    },
    normalAgeByBirthYear: {
      value: {
        table: [
          [1953, 61],
          [1957, 62],
          [1961, 63],
          [1965, 64],
          [1969, 65],
        ],
      },
      source: MOHW_PENSION,
      asOf: AS_OF,
      status: 'confirmed',
      note: '출생연도 하한 → 기준 수급 개시 연령.',
    },
    inflationIndexed: {
      value: { enabled: true },
      source: MOHW_PENSION,
      asOf: AS_OF,
      status: 'confirmed',
      note: '매년 전국소비자물가변동률을 반영해 인상 → 실질가치 유지.',
    },
    effectiveTaxRate: {
      value: { rate: 0.03 },
      source: NTS,
      asOf: AS_OF,
      status: 'approximation',
      note: '공적연금은 종합과세 대상이나 연금소득공제가 크고 다른 소득에 의존. 실효세율로 근사.',
    },
  },

  healthInsurance: {
    rate: {
      value: { rate: 0.0719 },
      source: NHIS_2026,
      asOf: AS_OF,
      status: 'confirmed',
    },
    // 장기요양보험료율 0.9448% = 건강보험료의 13.14%
    longTermCareRatio: {
      value: { ratio: 0.1314 },
      source: MOHW_LTC,
      asOf: AS_OF,
      status: 'confirmed',
    },
    pensionIncomeRecognitionRatio: {
      value: { ratio: 0.5 },
      source: NHIS_2026,
      asOf: AS_OF,
      status: 'needs-verification',
      note: '지역가입자 연금소득 인정 비율 근사. 공단 1차 자료로 재확인 필요.',
    },
    financialIncomeThreshold: {
      value: { amount: 10_000_000 },
      source: NHIS_2026,
      asOf: AS_OF,
      status: 'needs-verification',
      note: '금융소득이 이 금액을 초과하면 지역가입자 소득에 포함(근사).',
    },
    minAnnualPremium: {
      value: { amount: 240_000 },
      source: NHIS_2026,
      asOf: AS_OF,
      status: 'approximation',
      note: '지역가입자 최저보험료 근사. 재산 부과분은 모델링하지 않으므로 실제보다 과소 추정.',
    },
  },

  inflation: {
    bokTarget: {
      value: { rate: 0.02 },
      source: BOK_TARGET,
      asOf: AS_OF,
      status: 'confirmed',
      note: '물가상승률 기본값의 근거.',
    },
  },

  proposed: {
    isaExemptGeneral: {
      value: { amount: 5_000_000 },
      source: AJU_2026_REFORM,
      asOf: AS_OF,
      status: 'proposed',
      note: '2026 세제개편안. 국회 통과 전.',
    },
    isaExemptLowIncome: {
      value: { amount: 10_000_000 },
      source: AJU_2026_REFORM,
      asOf: AS_OF,
      status: 'proposed',
    },
  },
}
