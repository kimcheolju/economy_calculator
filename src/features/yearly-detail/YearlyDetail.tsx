import { useState } from 'react'
import { ACCOUNT_LABELS, ACCOUNT_TYPES, type CalculationResult } from '@/calc/types'
import { ChartToggle } from '@/components/charts/ChartChrome'
import { Section } from '@/components/display/Primitives'
import { Table, Tbody, Td, Th, ThRow, Thead, Tr } from '@/components/display/Table'
import { downloadCsv } from '@/lib/csv'
import { formatKRW } from '@/lib/format'

const TABS = [
  { value: 'accumulation', label: '축적기' },
  { value: 'withdrawal', label: '인출기' },
] as const

/**
 * 연도별 상세 표 (design/05-ui-ux.md §5.7)
 * 차트와 동일한 데이터를 표로도 제공한다 (접근성 — 차트 대체 표현).
 */
export function YearlyDetail({ result }: { result: CalculationResult }) {
  const [tab, setTab] = useState<'accumulation' | 'withdrawal'>('accumulation')
  const { accumulation, withdrawal } = result

  return (
    <Section
      title="연도별 상세"
      badge={`축적 ${accumulation.snapshots.length}년 · 인출 ${withdrawal.rows.length}년`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ChartToggle label="표 선택" value={tab} options={TABS} onChange={setTab} />
        <button
          type="button"
          onClick={() => downloadCsv(result)}
          className="rounded-control border border-rule-strong px-2.5 py-1 text-micro font-medium text-ink-secondary transition-colors hover:bg-surface-sunken hover:text-ink"
        >
          CSV 내보내기
        </button>
      </div>

      {/*
        긴 표는 자체 영역 안에서만 세로 스크롤되고 머리행이 고정된다.
        30~40행을 페이지째로 스크롤하면 열이 무엇이었는지 잃어버린다.
      */}
      <div className="max-h-96 overflow-y-auto">
        {tab === 'accumulation' ? (
          <Table caption="축적기 연도별 상세" minWidth="820px">
            <Thead>
              <tr className="sticky top-0 bg-surface">
                <Th>나이</Th>
                <Th numeric>연간 납입</Th>
                <Th numeric>배당</Th>
                <Th numeric>세금</Th>
                <Th numeric>환급</Th>
                <Th numeric>자산(명목)</Th>
                <Th numeric>자산(오늘)</Th>
                <Th numeric>누적 원금</Th>
                <Th numeric>누적 수익</Th>
              </tr>
            </Thead>
            <Tbody>
              {accumulation.snapshots.map((snap) => (
                <Tr key={snap.age}>
                  <ThRow className="[font-variant-numeric:tabular-nums] whitespace-nowrap">{snap.age}세</ThRow>
                  <Td>{formatKRW(snap.contribution, 'compact')}</Td>
                  <Td>{formatKRW(snap.dividend, 'compact')}</Td>
                  <Td>{formatKRW(snap.taxPaid, 'compact')}</Td>
                  <Td>{formatKRW(snap.taxCredit, 'compact')}</Td>
                  <Td strong>{formatKRW(snap.balance.nominal, 'compact')}</Td>
                  <Td muted>{formatKRW(snap.balance.real, 'compact')}</Td>
                  <Td>{formatKRW(snap.cumulativePrincipal, 'compact')}</Td>
                  <Td>{formatKRW(snap.cumulativeGain, 'compact')}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        ) : (
          <Table caption="인출기 연도별 상세" minWidth="900px">
            <Thead>
              <tr className="sticky top-0 bg-surface">
                <Th>나이</Th>
                <Th>구간</Th>
                <Th numeric>세전 인출</Th>
                {ACCOUNT_TYPES.map((account) => (
                  <Th key={account} numeric>
                    {ACCOUNT_LABELS[account]}
                  </Th>
                ))}
                <Th numeric>연금</Th>
                <Th numeric>세금</Th>
                <Th numeric>건보료</Th>
                <Th numeric>실수령(오늘)</Th>
                <Th numeric>잔여자산</Th>
              </tr>
            </Thead>
            <Tbody>
              {withdrawal.rows.map((row) => (
                <Tr key={row.age}>
                  <ThRow className="[font-variant-numeric:tabular-nums] whitespace-nowrap">{row.age}세</ThRow>
                  <Td numeric={false} muted className="whitespace-nowrap">
                    {row.phase}
                  </Td>
                  <Td>{formatKRW(row.grossWithdrawal, 'compact')}</Td>
                  {ACCOUNT_TYPES.map((account) => (
                    <Td key={account} muted>
                      {row.withdrawalByAccount[account] > 0
                        ? formatKRW(row.withdrawalByAccount[account], 'compact')
                        : '—'}
                    </Td>
                  ))}
                  <Td>{row.pensionIncome > 0 ? formatKRW(row.pensionIncome, 'compact') : '—'}</Td>
                  <Td>{formatKRW(row.incomeTax, 'compact')}</Td>
                  <Td>{formatKRW(row.healthInsurance, 'compact')}</Td>
                  <Td strong>{formatKRW(row.netIncome.real, 'compact')}</Td>
                  <Td>{formatKRW(row.endingBalance.nominal, 'compact')}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </div>

      <p className="text-micro text-ink-muted">
        표의 금액은 축약 표기입니다. 정확한 원 단위 값은 CSV 내보내기로 확인하세요.
      </p>
    </Section>
  )
}
