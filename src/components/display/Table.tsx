import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react'

/**
 * 데이터 표 프리미티브.
 *
 * 표는 이 앱에서 차트만큼 중요한 산출물이다 — 차트의 접근성 대체 경로이자
 * (design/05-ui-ux.md §11) 색 대비 경고의 구제 수단이기도 하다.
 * 세로줄은 긋지 않는다. 행 구분 hairline 과 정렬만으로 열이 읽히며,
 * 격자를 다 그으면 숫자보다 선이 먼저 보인다.
 */

export function Table({
  children,
  minWidth,
  caption,
}: {
  children: ReactNode
  /** 이 폭 아래에서는 컨테이너 안에서만 가로 스크롤된다 */
  minWidth?: string
  caption: string
}) {
  return (
    <div className="table-scroll -mx-4 px-4">
      <table className="w-full text-caption" style={minWidth ? { minWidth } : undefined}>
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  )
}

export function Thead({ children }: { children: ReactNode }) {
  return <thead className="border-b border-rule">{children}</thead>
}

export function Tbody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>
}

export function Tr({
  children,
  selected,
  className = '',
}: {
  children: ReactNode
  selected?: boolean
  className?: string
}) {
  return (
    <tr
      className={`border-b border-rule last:border-0 ${selected ? 'bg-accent-wash' : ''} ${className}`}
    >
      {children}
    </tr>
  )
}

type ThProps = ThHTMLAttributes<HTMLTableCellElement> & {
  children: ReactNode
  /** 숫자 열은 오른쪽 정렬 */
  numeric?: boolean
}

export function Th({ children, numeric, className = '', ...rest }: ThProps) {
  return (
    <th
      scope="col"
      className={`px-2 py-2 text-micro font-medium text-ink-muted first:pl-0 last:pr-0 ${
        numeric ? 'text-right' : 'text-left'
      } ${className}`}
      {...rest}
    >
      {children}
    </th>
  )
}

/** 행 머리 셀 — 각 행이 무엇에 대한 것인지 스크린리더가 알 수 있게 한다 */
export function ThRow({ children, className = '', ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="row"
      className={`px-2 py-2 text-left font-normal text-ink first:pl-0 last:pr-0 ${className}`}
      {...rest}
    >
      {children}
    </th>
  )
}

type TdProps = TdHTMLAttributes<HTMLTableCellElement> & {
  children: ReactNode
  numeric?: boolean
  muted?: boolean
  strong?: boolean
}

export function Td({ children, numeric = true, muted, strong, className = '', ...rest }: TdProps) {
  return (
    <td
      className={`px-2 py-2 first:pl-0 last:pr-0 ${numeric ? 'text-right [font-variant-numeric:tabular-nums]' : ''} ${
        muted ? 'text-ink-muted' : 'text-ink-secondary'
      } ${strong ? 'font-semibold text-ink' : ''} ${className}`}
      {...rest}
    >
      {children}
    </td>
  )
}

/** 표 아래 각주 묶음. */
export function TableNotes({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 space-y-1.5 border-t border-rule pt-3 text-micro text-ink-muted">{children}</div>
  )
}
