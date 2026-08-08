import { ACCOUNT_LABELS, type CalculationResult } from '@/calc/types'
import { Callout, Panel } from '@/components/display/Primitives'
import { Table, Tbody, Td, Th, ThRow, Thead, Tr, TableNotes } from '@/components/display/Table'
import { formatKRW } from '@/lib/format'

/**
 * 구간 색은 이름으로 고정 매핑한다 — 인덱스로 배정하면 은퇴 나이가 55세 이상이 되어
 * '브리지 1' 이 사라질 때 남은 구간의 색이 바뀐다. 색은 순위가 아니라 대상을 따른다.
 */
const PHASE_COLORS: Record<string, string> = {
  '브리지 1': 'bg-series-2',
  '브리지 2': 'bg-series-3',
  '연금 수령기': 'bg-series-1',
}

/**
 * 은퇴 후 구간별 현금흐름 (검토판 §2.4, design/05-ui-ux.md §6)
 *
 * 브리지 기간 문제를 눈에 보이게 만드는 것이 목적이다:
 * 52세 은퇴 → 국민연금 65세면 13년간 투자자산만으로 생활해야 하고,
 * 연금저축은 55세 전에는 인출할 수 없다.
 */
export function PhaseTable({ result }: { result: CalculationResult }) {
  const { withdrawal } = result
  const notes = withdrawal.phases.filter((phase) => phase.note)

  return (
    <Panel title="은퇴 후 현금흐름 구간">
      <Table caption="은퇴 후 연령 구간별 인출 재원과 월 실수령액" minWidth="680px">
        <Thead>
          <tr>
            <Th>구간</Th>
            <Th>나이</Th>
            <Th>사용 가능 재원</Th>
            <Th numeric>월 인출</Th>
            <Th numeric>월 연금</Th>
            <Th numeric>월 실수령</Th>
            <Th numeric>구간 말 잔여자산</Th>
          </tr>
        </Thead>
        <Tbody>
          {withdrawal.phases.map((phase) => (
            <Tr key={phase.name}>
              <ThRow>
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  <span
                    className={`size-2 shrink-0 rounded-full ${PHASE_COLORS[phase.name] ?? 'bg-ink-muted'}`}
                    aria-hidden
                  />
                  {phase.name}
                </span>
              </ThRow>
              <Td numeric={false} className="[font-variant-numeric:tabular-nums] whitespace-nowrap">
                {phase.fromAge}~{phase.toAge}
              </Td>
              <Td numeric={false} muted className="text-micro">
                {phase.availableSources.map((a) => ACCOUNT_LABELS[a]).join(', ')}
              </Td>
              <Td>{formatKRW(phase.avgMonthlyWithdrawal, 'compact')}</Td>
              <Td>{phase.avgMonthlyPension > 0 ? formatKRW(phase.avgMonthlyPension, 'compact') : '—'}</Td>
              <Td strong>
                {formatKRW(phase.avgMonthlyNet.nominal, 'compact')}
                <span className="block text-micro font-normal text-ink-muted">
                  오늘 {formatKRW(phase.avgMonthlyNet.real, 'compact')}
                </span>
              </Td>
              <Td>{formatKRW(phase.endingBalance.nominal, 'compact')}</Td>
            </Tr>
          ))}
        </Tbody>
      </Table>

      {notes.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {notes.map((phase) => (
            <Callout key={phase.name} tone="warning">
              {phase.note}
            </Callout>
          ))}
        </div>
      )}

      <TableNotes>
        <p>각 구간의 월 금액은 구간 내 평균입니다. 연도별 값은 아래 상세 표에서 확인할 수 있습니다.</p>
      </TableNotes>
    </Panel>
  )
}
