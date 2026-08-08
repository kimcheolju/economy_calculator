/**
 * 입력 검증 스키마 (design/04-data-model.md §3)
 *
 * URL·localStorage 에서 복원되는 값은 반드시 여기를 통과해야 한다.
 * 신뢰할 수 없는 문자열이 계산 엔진에 들어가면 NaN 이 전파되어 조용히 잘못된 결과를 만든다.
 */

import { z } from 'zod'
import type { CalculatorInput } from '@/calc/types'
import { DEFAULT_INPUT } from './defaults'
import { formatKRW } from './format'

const accountType = z.enum(['taxable', 'isa', 'pensionSavings', 'irp', 'dcRetirement'])

const accountRecord = z.object({
  taxable: z.number().min(0),
  isa: z.number().min(0),
  pensionSavings: z.number().min(0),
  irp: z.number().min(0),
  dcRetirement: z.number().min(0),
})

export const calculatorInputSchema = z
  .object({
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
      totalReturn: z.number().min(-0.05).max(0.2),
      priceReturn: z.number().min(-0.2).max(0.2),
      dividendYield: z.number().min(0).max(0.1),
      inflation: z.number().min(0).max(0.1),
      ter: z.number().min(0).max(0.02),
      retirementReturn: z.number().min(-0.05).max(0.15),
      reinvestDividends: z.boolean(),
      contributionTiming: z.enum(['begin', 'end']),
      volatility: z.number().min(0).max(0.6),
    }),

    accounts: z.object({
      monthlyContribution: z.number().min(0).max(500_000_000),
      contributionGrowthRate: z.number().min(0).max(0.15),
      initialBalances: accountRecord,
      allocationMode: z.enum(['auto', 'manual']),
      allocationPriority: z.array(accountType).min(1),
      manualAllocation: accountRecord.optional(),
      etfKind: z.enum(['domesticEquity', 'domesticListedForeign', 'foreignListed']),
      reinvestTaxCredit: z.boolean(),
      retirementIncomeTaxRate: z.number().min(0).max(0.45),
    }),

    retirement: z.object({
      targetMonthlySpendToday: z.number().min(0).max(500_000_000),
      strategy: z.enum(['fixedReal', 'fixedPercent', 'depletion', 'vpw']),
      withdrawalRate: z.number().min(0.005).max(0.1),
      withdrawalPriority: z.array(accountType).min(1),
      nationalPension: z.object({
        monthlyAmountToday: z.number().min(0).max(50_000_000),
        startAge: z.number().int().min(55).max(75),
        isCompanyEstimate: z.boolean(),
        inflationIndexed: z.boolean(),
        effectiveTaxRate: z.number().min(0).max(0.45),
      }),
      otherPension: z.object({
        monthlyAmountToday: z.number().min(0).max(50_000_000),
        startAge: z.number().int().min(40).max(90),
        inflationIndexed: z.boolean(),
      }),
      healthInsurance: z.object({
        mode: z.enum(['none', 'rateApprox', 'fixed']),
        fixedMonthlyAmount: z.number().min(0).max(10_000_000).optional(),
      }),
    }),

    events: z
      .array(
        z.object({
          id: z.string().min(1).max(64),
          label: z.string().max(40),
          age: z.number().int().min(19).max(110),
          amount: z.number().min(0).max(100_000_000_000),
          direction: z.enum(['inflow', 'outflow']),
          basis: z.enum(['real', 'nominal']),
        }),
      )
      .max(10),

    options: z.object({
      taxRuleSetId: z.string().min(1).max(32),
      applyProposedRules: z.boolean(),
      taxOverrides: z.record(z.string(), z.number()).optional(),
      scenarioOffsets: z.object({
        returnOffset: z.number().min(0).max(0.1),
        inflationOffset: z.number().min(0).max(0.05),
      }),
      monteCarlo: z.object({
        trials: z.number().int().min(100).max(50_000),
        seed: z.number().int(),
        model: z.enum(['lognormal', 'bootstrap']),
        annualApprox: z.boolean(),
      }),
    }),
  })
  .superRefine((v, ctx) => {
    if (v.basic.retirementAge <= v.basic.currentAge) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '은퇴 나이는 현재 나이보다 커야 합니다',
        path: ['basic', 'retirementAge'],
      })
    }
    if (v.basic.endAge <= v.basic.retirementAge) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '자산 사용 종료 나이는 은퇴 나이보다 커야 합니다',
        path: ['basic', 'endAge'],
      })
    }
    if (v.returns.mode === 'totalReturn' && v.returns.dividendYield > v.returns.totalReturn) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '배당수익률이 총수익률을 초과할 수 없습니다',
        path: ['returns', 'dividendYield'],
      })
    }
  })

export type ValidationErrors = Record<string, string>

export interface ParseResult {
  input: CalculatorInput
  errors: ValidationErrors
  ok: boolean
}

/**
 * 필드가 어떤 단위로 화면에 보이는지.
 * Zod 의 범위 위반 메시지를 사용자가 보는 단위로 옮기기 위한 것이다 —
 * 내부값 0.005 를 그대로 보여주면 "0.5%" 로 입력한 사용자가 이해할 수 없다.
 * 키는 경로의 마지막 조각.
 */
const FIELD_UNITS: Readonly<Record<string, 'age' | 'percent' | 'money' | 'plain'>> = {
  currentAge: 'age',
  retirementAge: 'age',
  endAge: 'age',
  startAge: 'age',
  age: 'age',
  totalReturn: 'percent',
  priceReturn: 'percent',
  dividendYield: 'percent',
  inflation: 'percent',
  ter: 'percent',
  retirementReturn: 'percent',
  volatility: 'percent',
  contributionGrowthRate: 'percent',
  withdrawalRate: 'percent',
  retirementIncomeTaxRate: 'percent',
  effectiveTaxRate: 'percent',
  returnOffset: 'percent',
  inflationOffset: 'percent',
  monthlyContribution: 'money',
  targetMonthlySpendToday: 'money',
  monthlyAmountToday: 'money',
  fixedMonthlyAmount: 'money',
  amount: 'money',
  taxable: 'money',
  isa: 'money',
  pensionSavings: 'money',
  irp: 'money',
  dcRetirement: 'money',
}

function formatBound(bound: number, unit: 'age' | 'percent' | 'money' | 'plain'): string {
  switch (unit) {
    case 'age':
      return `${bound}세`
    case 'percent':
      // 0.155 처럼 딱 떨어지지 않는 경계도 있으므로 불필요한 0 은 떼어낸다
      return `${Number((bound * 100).toFixed(4))}%`
    case 'money':
      return formatKRW(bound)
    case 'plain':
      return bound.toLocaleString('ko-KR')
  }
}

/**
 * Zod 기본 메시지는 영어다("Number must be greater than or equal to 19").
 * 사용자가 읽는 문장이므로 한국어로 옮긴다. superRefine 의 custom 메시지는 이미 한국어라 그대로 쓴다.
 */
function toKoreanMessage(issue: z.ZodIssue): string {
  if (issue.code === z.ZodIssueCode.custom) return issue.message

  const unit = FIELD_UNITS[String(issue.path[issue.path.length - 1])] ?? 'plain'

  if (issue.code === z.ZodIssueCode.too_small) {
    const bound = Number(issue.minimum)
    if (!Number.isFinite(bound)) return '값이 너무 작습니다'
    return issue.type === 'array'
      ? `${bound}개 이상이어야 합니다`
      : `${formatBound(bound, unit)} 이상이어야 합니다`
  }

  if (issue.code === z.ZodIssueCode.too_big) {
    const bound = Number(issue.maximum)
    if (!Number.isFinite(bound)) return '값이 너무 큽니다'
    return issue.type === 'array'
      ? `${bound}개 이하여야 합니다`
      : `${formatBound(bound, unit)} 이하여야 합니다`
  }

  if (issue.code === z.ZodIssueCode.invalid_type) return '숫자를 입력하세요'
  if (issue.code === z.ZodIssueCode.not_finite) return '숫자를 입력하세요'
  if (issue.code === z.ZodIssueCode.invalid_enum_value) return '선택할 수 없는 값입니다'

  return '입력값을 확인하세요'
}

/** 입력 검증 — 실패한 필드 경로와 메시지를 반환한다 */
export function validateInput(value: CalculatorInput): ValidationErrors {
  const result = calculatorInputSchema.safeParse(value)
  if (result.success) return {}

  const errors: ValidationErrors = {}
  for (const issue of result.error.issues) {
    const key = issue.path.join('.')
    if (!errors[key]) errors[key] = toKoreanMessage(issue)
  }
  return errors
}

/**
 * 오류 경로 → 화면에 보이는 항목 이름.
 * "입력값에 오류가 있습니다"만 띄우면 사용자가 어디를 고쳐야 할지 알 수 없다.
 */
const FIELD_LABELS: Readonly<Record<string, string>> = {
  'basic.currentAge': '현재 나이',
  'basic.retirementAge': '은퇴 목표 나이',
  'basic.endAge': '자산 사용 종료 나이',
  'returns.totalReturn': '예상 연평균 총수익률',
  'returns.priceReturn': '예상 연평균 가격상승률',
  'returns.dividendYield': '배당수익률',
  'returns.inflation': '예상 연평균 물가상승률',
  'returns.ter': 'ETF 연간 총보수',
  'returns.retirementReturn': '은퇴 후 예상 수익률',
  'returns.volatility': '수익률 변동성',
  'accounts.monthlyContribution': '매달 투자할 돈',
  'accounts.contributionGrowthRate': '매년 투자금 증가율',
  'accounts.retirementIncomeTaxRate': '퇴직소득 실효세율',
  'retirement.targetMonthlySpendToday': '은퇴 후 매달 쓰고 싶은 돈',
  'retirement.withdrawalRate': '안전인출률',
  'retirement.nationalPension.monthlyAmountToday': '국민연금 예상 월 수령액',
  'retirement.nationalPension.startAge': '국민연금 수령 개시 나이',
  'retirement.otherPension.monthlyAmountToday': '기타 연금 예상 월 수령액',
  'retirement.otherPension.startAge': '기타 연금 수령 개시 나이',
  'retirement.healthInsurance.fixedMonthlyAmount': '월 건강보험료',
  'options.monteCarlo.trials': 'Monte Carlo 시행 횟수',
  events: '일회성 이벤트',
}

/** 계좌별 현재 자산은 경로가 계좌 이름으로 끝난다 */
const ACCOUNT_BALANCE_LABELS: Readonly<Record<string, string>> = {
  taxable: '일반계좌 현재 자산',
  isa: 'ISA 현재 자산',
  pensionSavings: '연금저축 현재 자산',
  irp: 'IRP 현재 자산',
  dcRetirement: 'DC·퇴직금 현재 자산',
}

function labelFor(path: string): string {
  const known = FIELD_LABELS[path]
  if (known) return known
  if (path.startsWith('accounts.initialBalances.')) {
    return ACCOUNT_BALANCE_LABELS[path.slice('accounts.initialBalances.'.length)] ?? '계좌별 현재 자산'
  }
  return path
}

/** 배너·요약에 쓰는 "항목 이름: 메시지" 문장들 */
export function describeErrors(errors: ValidationErrors): string[] {
  return Object.entries(errors).map(([path, message]) => `${labelFor(path)} — ${message}`)
}

/**
 * 저장된 데이터 파싱. 실패하면 기본값으로 폴백한다.
 * 절대 조용히 NaN 을 통과시키지 않는다.
 */
export function parseStoredInput(raw: unknown): ParseResult {
  const migrated = migrate(raw)
  const result = calculatorInputSchema.safeParse(migrated)
  if (result.success) {
    return { input: result.data as CalculatorInput, errors: {}, ok: true }
  }
  return { input: DEFAULT_INPUT, errors: validateInput(DEFAULT_INPUT), ok: false }
}

type Migration = (old: Record<string, unknown>) => Record<string, unknown>

/**
 * 스키마 마이그레이션 체인.
 * 입력 필드를 추가·변경할 때는 반드시 schemaVersion 을 올리고 여기에 등록한다.
 * 저장된 링크가 깨지면 사용자가 계산 결과를 잃는다.
 */
const MIGRATIONS: Record<number, Migration> = {
  // 2: (v1) => ({ ...v1, schemaVersion: 2, newField: defaultValue }),
}

export const CURRENT_SCHEMA_VERSION = 1

function migrate(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw
  let current = raw as Record<string, unknown>
  let version = typeof current.schemaVersion === 'number' ? current.schemaVersion : 0

  while (version < CURRENT_SCHEMA_VERSION) {
    const next = MIGRATIONS[version + 1]
    if (!next) break
    current = next(current)
    version += 1
  }

  return current
}
