import type { CalculationResult } from '@/calc/types'
import { STRATEGY_DEFINITIONS } from '@/calc/types'
import { Check } from '@/components/display/Icon'
import { Panel } from '@/components/display/Primitives'
import { Table, Tbody, Td, Th, ThRow, Thead, Tr, TableNotes } from '@/components/display/Table'
import { formatKRW, formatPercent } from '@/lib/format'

/**
 * 인출률 비교 표 (원안 51~59행, design/05-ui-ux.md §5)
 *
 * 한 가지 숫자만 제시하지 않고 3% / 3.5% / 4% / 사용자 지정 / 계획 소진형을 나란히 비교한다.
 */
export function FireTable({ result }: { result: CalculationResult }) {
  const { fire, input, accumulation } = result
  const userRate = input.retirement.withdrawalRate

  return (
    <Panel title="경제적 자유 필요자산 — 인출 방식별 비교">
      <Table caption="인출 방식별 필요 총자산과 월 실수령액 비교" minWidth="720px">
        <Thead>
          <tr>
            <Th>방식</Th>
            <Th numeric>
              필요 총자산
              <br />
              (은퇴 시점 명목)
            </Th>
            <Th numeric>
              필요 총자산
              <br />
              (오늘 가치)
            </Th>
            <Th numeric>
              월 인출
              <br />
              (세전)
            </Th>
            <Th numeric>
              월 실수령
              <br />
              (세후·건보료 차감)
            </Th>
            <Th numeric>
              오늘 구매력
              <br />
              환산
            </Th>
            <Th numeric>달성</Th>
          </tr>
        </Thead>
        <Tbody>
          {fire.comparison.map((row) => {
            const isSelected = row.rate !== null && Math.abs(row.rate - userRate) < 1e-9
            return (
              <Tr key={row.method} selected={isSelected}>
                <ThRow>
                  <span className="flex items-center gap-1.5">
                    {/* 선택 행은 색만이 아니라 레이블로도 구분된다 */}
                    {isSelected && (
                      <span className="rounded bg-accent px-1 py-px text-micro font-medium text-on-accent">
                        현재
                      </span>
                    )}
                    {row.method}
                  </span>
                </ThRow>
                <Td>{formatKRW(row.requiredAssets.nominal, 'compact')}</Td>
                <Td muted>{formatKRW(row.requiredAssets.real, 'compact')}</Td>
                <Td>{formatKRW(row.monthlyWithdrawGross, 'compact')}</Td>
                <Td>{formatKRW(row.monthlyNet.nominal, 'compact')}</Td>
                <Td strong>{formatKRW(row.monthlyNet.real, 'compact')}</Td>
                <Td>
                  {row.isAchievable ? (
                    <span className="inline-flex items-center gap-1 text-success-text">
                      <Check className="size-3.5" />
                      달성
                    </span>
                  ) : (
                    <span className="text-ink-secondary">부족 {formatKRW(row.shortfall, 'compact')}</span>
                  )}
                </Td>
              </Tr>
            )
          })}
        </Tbody>
      </Table>

      <TableNotes>
        <p>
          예상 은퇴자산{' '}
          <strong className="font-semibold text-ink-secondary [font-variant-numeric:tabular-nums]">
            {formatKRW(accumulation.finalBalance.nominal)}
          </strong>{' '}
          과 비교한 결과입니다. 월 실수령액은 모든 방식에서 동일한 목표 생활비(
          {formatKRW(fire.targetMonthlySpend.nominal)})를 충족하기 위한 금액이며, 방식에 따라 그에 필요한 자산 규모가
          달라집니다.
        </p>
        <p>
          <strong className="font-semibold text-ink-secondary">4% 룰</strong>은 미국 주식·채권 과거 데이터와 30년
          기간을 전제로 합니다. 한국의 세제·건강보험료·기대수명(90세 이상 가정 시 40년 이상)에는 그대로 적용되지
          않으므로 기본값을 3.5%로 두었습니다.
        </p>
        <p>
          현재 선택된 전략:{' '}
          <strong className="font-semibold text-ink-secondary">
            {STRATEGY_DEFINITIONS[input.retirement.strategy]}
          </strong>
        </p>
        <p>
          세전 인출액은 세금·건강보험료를 역산(gross-up)해 계산했습니다. 인출률 {formatPercent(userRate)} 기준 연 세전
          필요액{' '}
          <strong className="font-semibold text-ink-secondary [font-variant-numeric:tabular-nums]">
            {formatKRW(fire.grossNeededAtRetirement)}
          </strong>
          .
        </p>
      </TableNotes>
    </Panel>
  )
}
