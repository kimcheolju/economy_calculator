/**
 * CSV 내보내기 (design/05-ui-ux.md §14)
 * 연도별 상세 표 전체(축적기 + 인출기)를 exact 포맷으로 내보낸다.
 */

import { ACCOUNT_LABELS, ACCOUNT_TYPES, type CalculationResult } from '@/calc/types'
import { csvCell } from './format'

function round(value: number): number {
  return Math.round(value)
}

export function buildCsv(result: CalculationResult): string {
  const { input, accumulation, withdrawal } = result
  const lines: string[] = []

  lines.push(`# 경제적 자유 계산기 상세 결과`)
  lines.push(`# 계산 시각,${result.computedAtIso}`)
  lines.push(`# 세제 기준,${input.options.taxRuleSetId}`)
  lines.push(`# 주의,투자 권유가 아니며 세금·건강보험료 계산은 참고용 근사입니다`)
  lines.push('')

  // ── 축적기 ────────────────────────────────────────────────
  lines.push('## 축적기')
  const accHeader = [
    '나이',
    '경과연수',
    '연간 납입',
    '배당',
    '납부 세금',
    '세액공제 환급',
    '연말 자산(명목)',
    '연말 자산(오늘가치)',
    '누적 납입원금',
    '누적 투자수익',
    ...ACCOUNT_TYPES.map((a) => `${ACCOUNT_LABELS[a]} 잔액`),
  ]
  lines.push(accHeader.map(csvCell).join(','))

  for (const snap of accumulation.snapshots) {
    lines.push(
      [
        snap.age,
        snap.yearIndex + 1,
        round(snap.contribution),
        round(snap.dividend),
        round(snap.taxPaid),
        round(snap.taxCredit),
        round(snap.balance.nominal),
        round(snap.balance.real),
        round(snap.cumulativePrincipal),
        round(snap.cumulativeGain),
        ...ACCOUNT_TYPES.map((a) => round(snap.byAccount[a])),
      ]
        .map(csvCell)
        .join(','),
    )
  }

  lines.push('')

  // ── 인출기 ────────────────────────────────────────────────
  lines.push('## 인출기')
  const wdHeader = [
    '나이',
    '구간',
    '목표 생활비(명목)',
    '목표 생활비(오늘가치)',
    '세전 인출액',
    ...ACCOUNT_TYPES.map((a) => `${ACCOUNT_LABELS[a]} 인출`),
    '연금소득',
    '소득세',
    '건강보험료',
    '실수령(명목)',
    '실수령(오늘가치)',
    '연말 잔여자산(명목)',
    '미충족액',
  ]
  lines.push(wdHeader.map(csvCell).join(','))

  for (const row of withdrawal.rows) {
    lines.push(
      [
        row.age,
        row.phase,
        round(row.targetSpend.nominal),
        round(row.targetSpend.real),
        round(row.grossWithdrawal),
        ...ACCOUNT_TYPES.map((a) => round(row.withdrawalByAccount[a])),
        round(row.pensionIncome),
        round(row.incomeTax),
        round(row.healthInsurance),
        round(row.netIncome.nominal),
        round(row.netIncome.real),
        round(row.endingBalance.nominal),
        round(row.shortfall),
      ]
        .map(csvCell)
        .join(','),
    )
  }

  lines.push('')

  // ── 가정 ─────────────────────────────────────────────────
  lines.push('## 사용된 가정')
  lines.push(['구분', '항목', '값', '근거', '상태', '출처'].map(csvCell).join(','))
  for (const assumption of result.assumptions) {
    lines.push(
      [
        assumption.group,
        assumption.label,
        assumption.value,
        assumption.derivation ?? '',
        assumption.status ?? '',
        assumption.source ?? '',
      ]
        .map(csvCell)
        .join(','),
    )
  }

  return lines.join('\r\n')
}

export function downloadCsv(result: CalculationResult, filename = 'economy-calculator.csv'): void {
  // UTF-8 BOM — 엑셀에서 한글이 깨지지 않게 한다
  const blob = new Blob(['﻿' + buildCsv(result)], { type: 'text/csv;charset=utf-8' })
  triggerDownload(blob, filename)
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
