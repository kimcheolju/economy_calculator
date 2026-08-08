import { useState } from 'react'
import { Button, Section } from '@/components/display/Primitives'
import { Table, Tbody, Td, Th, ThRow, Thead, Tr, TableNotes } from '@/components/display/Table'
import { formatAchievement, formatKRW, formatPercent } from '@/lib/format'
import { useScenarios } from '@/store/useResult'

/**
 * 시나리오 비교 (원안 6번, design/01-features.md §6)
 * 주식시장은 매년 일정한 수익률을 내지 않으므로 세 가지 가정을 나란히 본다.
 */
export function ScenarioCompare() {
  const [enabled, setEnabled] = useState(false)
  const scenarios = useScenarios(enabled)

  return (
    <Section title="시나리오 비교 (보수 / 기준 / 낙관)">
      {!enabled ? (
        <Button variant="primary" onClick={() => setEnabled(true)}>
          세 시나리오 계산하기
        </Button>
      ) : scenarios === null ? (
        <p className="text-caption text-ink-muted">입력값을 확인해 주세요.</p>
      ) : (
        <>
          <Table caption="보수적·기준·낙관적 시나리오 비교" minWidth="600px">
            <Thead>
              <tr>
                <Th>시나리오</Th>
                <Th numeric>총수익률</Th>
                <Th numeric>물가</Th>
                <Th numeric>은퇴자산(오늘가치)</Th>
                <Th numeric>월 사용액(오늘가치)</Th>
                <Th numeric>달성률</Th>
              </tr>
            </Thead>
            <Tbody>
              {scenarios.map((scenario) => (
                <Tr key={scenario.key} selected={scenario.key === 'base'}>
                  <ThRow>
                    <span className="flex items-center gap-1.5 whitespace-nowrap">
                      {/* 기준 시나리오는 색만이 아니라 레이블로도 구분된다 */}
                      {scenario.key === 'base' && (
                        <span className="rounded bg-accent px-1 py-px text-micro font-medium text-on-accent">
                          기준
                        </span>
                      )}
                      {scenario.label}
                    </span>
                  </ThRow>
                  <Td>{formatPercent(scenario.totalReturn)}</Td>
                  <Td>{formatPercent(scenario.inflation)}</Td>
                  <Td>{formatKRW(scenario.result.accumulation.finalBalance.real, 'compact')}</Td>
                  <Td strong>{formatKRW(scenario.result.withdrawal.firstYearMonthlyNet.real)}</Td>
                  <Td>{formatAchievement(scenario.result.fire.achievementBySpend)}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          <TableNotes>
            <p>
              보수적 시나리오는 수익률을 낮추고 물가를 함께 올려 불리하게 봅니다. 오프셋은 고급 설정에서 조정할 수
              있습니다. 배당수익률은 시나리오와 무관하게 유지됩니다.
            </p>
          </TableNotes>
        </>
      )}
    </Section>
  )
}
