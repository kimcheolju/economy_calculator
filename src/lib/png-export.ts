/**
 * PNG 내보내기 (design/05-ui-ux.md §14)
 *
 * SVG 직렬화 대신 canvas 에 직접 그린다 — 외부 폰트·스타일 의존이 없어 결과가 결정론적이다.
 * 캡처가 맥락 없이 공유되므로 기준일과 면책 문구를 항상 포함한다.
 */

import type { CalculationResult } from '@/calc/types'
import { triggerDownload } from './csv'
import { formatAchievement, formatKRW, formatPercent } from './format'

const WIDTH = 1200
const HEIGHT = 820
const PADDING = 48

const FONT = '"Malgun Gothic", system-ui, sans-serif'

export async function exportPng(result: CalculationResult, filename = 'economy-calculator.png'): Promise<void> {
  const canvas = document.createElement('canvas')
  const scale = 2
  canvas.width = WIDTH * scale
  canvas.height = HEIGHT * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 컨텍스트를 만들 수 없습니다')
  ctx.scale(scale, scale)

  const { input, accumulation, withdrawal, fire } = result

  // 배경
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  // 헤더
  ctx.fillStyle = '#0f172a'
  ctx.font = `600 22px ${FONT}`
  ctx.fillText('경제적 자유 계산기', PADDING, 56)

  ctx.fillStyle = '#64748b'
  ctx.font = `13px ${FONT}`
  ctx.fillText(
    `${input.basic.currentAge}세 → ${input.basic.retirementAge}세 은퇴 → ${input.basic.endAge}세까지 · ` +
      `월 ${formatKRW(input.accounts.monthlyContribution)} 투자 · 수익률 ${formatPercent(
        result.normalizedReturns.totalReturn,
      )} · 물가 ${formatPercent(input.returns.inflation)}`,
    PADDING,
    80,
  )

  // 핵심 지표
  ctx.fillStyle = '#eff6ff'
  roundRect(ctx, PADDING, 104, WIDTH - PADDING * 2, 108, 12)
  ctx.fill()

  ctx.fillStyle = '#1d4ed8'
  ctx.font = `13px ${FONT}`
  ctx.fillText('은퇴 후 매달 쓸 수 있는 돈 (오늘 구매력 기준, 세후)', PADDING + 24, 134)
  ctx.font = `700 42px ${FONT}`
  ctx.fillText(formatKRW(withdrawal.firstYearMonthlyNet.real), PADDING + 24, 182)

  ctx.fillStyle = '#3b82f6'
  ctx.font = `13px ${FONT}`
  ctx.fillText(
    `명목 ${formatKRW(withdrawal.firstYearMonthlyNet.nominal)} · 목표 달성률 ${formatAchievement(
      fire.achievementBySpend,
    )}`,
    PADDING + 24,
    204,
  )

  // 보조 지표 3개
  const metrics: [string, string, string][] = [
    [
      '예상 은퇴자산',
      formatKRW(accumulation.finalBalance.nominal, 'compact'),
      `오늘 가치 ${formatKRW(accumulation.finalBalance.real, 'compact')}`,
    ],
    [
      '총납입원금 / 투자수익',
      `${formatKRW(accumulation.totalPrincipal, 'compact')} / ${formatKRW(accumulation.totalGain, 'compact')}`,
      `납부 세금 ${formatKRW(accumulation.totalTaxPaid, 'compact')}`,
    ],
    [
      '자산 소진',
      withdrawal.depletionAge === null ? '없음' : `${withdrawal.depletionAge}세`,
      `계획 종료 ${input.basic.endAge}세`,
    ],
  ]

  const cardWidth = (WIDTH - PADDING * 2 - 24 * 2) / 3
  metrics.forEach(([label, value, note], index) => {
    const x = PADDING + index * (cardWidth + 24)
    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth = 1
    roundRect(ctx, x, 232, cardWidth, 84, 10)
    ctx.stroke()

    ctx.fillStyle = '#64748b'
    ctx.font = `12px ${FONT}`
    ctx.fillText(label, x + 16, 256)
    ctx.fillStyle = '#0f172a'
    ctx.font = `600 20px ${FONT}`
    ctx.fillText(value, x + 16, 284)
    ctx.fillStyle = '#94a3b8'
    ctx.font = `11px ${FONT}`
    ctx.fillText(note, x + 16, 304)
  })

  // 자산 성장 그래프
  drawChart(ctx, result, PADDING, 340, WIDTH - PADDING * 2, 260)

  // 가정 요약
  let y = 640
  ctx.fillStyle = '#0f172a'
  ctx.font = `600 13px ${FONT}`
  ctx.fillText('사용된 주요 가정', PADDING, y)
  y += 20

  ctx.font = `11px ${FONT}`
  const keyAssumptions = result.assumptions
    .filter((a) => a.group === '수익률' || a.group === '적용 세제')
    .slice(0, 12)

  keyAssumptions.forEach((assumption, index) => {
    const column = index % 2
    const row = Math.floor(index / 2)
    const x = PADDING + column * ((WIDTH - PADDING * 2) / 2)
    const lineY = y + row * 16
    ctx.fillStyle = '#64748b'
    ctx.fillText(assumption.label, x, lineY)
    ctx.fillStyle = '#0f172a'
    ctx.fillText(assumption.value, x + 220, lineY)
  })

  // 면책 문구 — 캡처가 맥락 없이 공유되므로 항상 포함한다
  ctx.fillStyle = '#94a3b8'
  ctx.font = `10px ${FONT}`
  ctx.fillText(
    `이 계산기는 정보 제공 목적이며 투자 권유가 아닙니다. 세금·연금·건강보험료는 참고용 근사입니다. ` +
      `세제 기준일 ${result.assumptions.find((a) => a.label === '세제 기준일')?.asOf ?? '—'}`,
    PADDING,
    HEIGHT - 24,
  )

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('PNG 생성에 실패했습니다')
  triggerDownload(blob, filename)
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + width, y, x + width, y + height, radius)
  ctx.arcTo(x + width, y + height, x, y + height, radius)
  ctx.arcTo(x, y + height, x, y, radius)
  ctx.arcTo(x, y, x + width, y, radius)
  ctx.closePath()
}

function drawChart(
  ctx: CanvasRenderingContext2D,
  result: CalculationResult,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const points: { age: number; principal: number; total: number }[] = []
  for (const snap of result.accumulation.snapshots) {
    points.push({ age: snap.age, principal: snap.cumulativePrincipal, total: snap.balance.nominal })
  }
  for (const row of result.withdrawal.rows) {
    points.push({ age: row.age, principal: 0, total: row.endingBalance.nominal })
  }
  if (points.length < 2) return

  const maxValue = Math.max(...points.map((p) => p.total), 1)
  const minAge = points[0]!.age
  const maxAge = points[points.length - 1]!.age
  const toX = (age: number) => x + ((age - minAge) / Math.max(1, maxAge - minAge)) * width
  const toY = (value: number) => y + height - (value / maxValue) * height

  // 축·격자
  ctx.strokeStyle = '#e2e8f0'
  ctx.lineWidth = 1
  for (let i = 0; i <= 4; i++) {
    const gridY = y + (height / 4) * i
    ctx.beginPath()
    ctx.moveTo(x, gridY)
    ctx.lineTo(x + width, gridY)
    ctx.stroke()
    ctx.fillStyle = '#94a3b8'
    ctx.font = `10px ${FONT}`
    ctx.fillText(formatKRW(maxValue * (1 - i / 4), 'compact'), x + width + 6, gridY + 3)
  }

  // 납입원금 면적
  ctx.beginPath()
  ctx.moveTo(toX(minAge), toY(0))
  for (const point of points) ctx.lineTo(toX(point.age), toY(point.principal))
  ctx.lineTo(toX(maxAge), toY(0))
  ctx.closePath()
  ctx.fillStyle = 'rgba(59, 130, 246, 0.35)'
  ctx.fill()

  // 총자산 선
  ctx.beginPath()
  points.forEach((point, index) => {
    const px = toX(point.age)
    const py = toY(point.total)
    if (index === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  })
  ctx.strokeStyle = '#0f172a'
  ctx.lineWidth = 2
  ctx.stroke()

  // 은퇴 기준선
  const retirementX = toX(result.input.basic.retirementAge)
  ctx.beginPath()
  ctx.setLineDash([4, 3])
  ctx.moveTo(retirementX, y)
  ctx.lineTo(retirementX, y + height)
  ctx.strokeStyle = '#64748b'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.setLineDash([])

  ctx.fillStyle = '#64748b'
  ctx.font = `10px ${FONT}`
  ctx.fillText(`은퇴 ${result.input.basic.retirementAge}세`, retirementX + 4, y + 12)
  ctx.fillText(`${minAge}세`, x, y + height + 14)
  ctx.fillText(`${maxAge}세`, x + width - 24, y + height + 14)

  // 범례
  ctx.fillStyle = 'rgba(59, 130, 246, 0.35)'
  ctx.fillRect(x, y - 14, 10, 10)
  ctx.fillStyle = '#64748b'
  ctx.fillText('누적 납입원금', x + 16, y - 5)
  ctx.fillStyle = '#0f172a'
  ctx.fillRect(x + 110, y - 10, 10, 2)
  ctx.fillStyle = '#64748b'
  ctx.fillText('총자산', x + 126, y - 5)
}
