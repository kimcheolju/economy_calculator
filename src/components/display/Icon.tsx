import type { ReactNode, SVGProps } from 'react'

/**
 * 인라인 SVG 아이콘 세트.
 *
 * 텍스트 글리프(▼ ▶ ✕ ⓘ ⚠ ▲ ƒ)를 쓰지 않는 이유:
 * 폰트마다 자형·기준선·굵기가 달라 플랫폼별로 크기와 정렬이 흔들리고,
 * 스크린리더가 문자로 읽어버린다. 아이콘 라이브러리를 새로 의존성으로
 * 추가하는 대신(CLAUDE.md §2 "추가 의존성은 신중히") 쓰는 것만 직접 그린다.
 *
 * 모두 currentColor 를 따르므로 색은 부모의 텍스트 토큰이 결정한다.
 * 장식용이므로 aria-hidden 이다 — 의미는 항상 옆의 텍스트나 aria-label 이 진다.
 */

type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & { className?: string }

function Glyph({ children, className = 'size-4', ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...rest}
    >
      {children}
    </svg>
  )
}

export function ChevronDown(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="m6 9 6 6 6-6" />
    </Glyph>
  )
}

export function ChevronUp(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="m18 15-6-6-6 6" />
    </Glyph>
  )
}

export function ChevronRight(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="m9 18 6-6-6-6" />
    </Glyph>
  )
}

export function Close(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Glyph>
  )
}

export function Info(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4M12 8h.01" />
    </Glyph>
  )
}

export function Alert(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </Glyph>
  )
}

export function Check(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M20 6 9 17l-5-5" />
    </Glyph>
  )
}

/** 계산식 보기 — 기존의 ƒ 글리프를 대체한다 */
export function Formula(props: IconProps) {
  return (
    <Glyph {...props}>
      <rect x="4" y="2.5" width="16" height="19" rx="2" />
      <path d="M8 7h8M8 11.5h3M8 16h3M15 11.5h1M15 16h1" />
    </Glyph>
  )
}

export function Link(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </Glyph>
  )
}

export function Image(props: IconProps) {
  return (
    <Glyph {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="1.5" />
      <path d="m21 15-4.5-4.5L3 21" />
    </Glyph>
  )
}

export function Reset(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </Glyph>
  )
}

export function Trash(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" />
    </Glyph>
  )
}

export function Sun(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Glyph>
  )
}

export function Moon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </Glyph>
  )
}

export function Monitor(props: IconProps) {
  return (
    <Glyph {...props}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </Glyph>
  )
}

export function More(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="5" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.25" fill="currentColor" stroke="none" />
    </Glyph>
  )
}

export function External(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M14 4h6v6M20 4l-8.5 8.5" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </Glyph>
  )
}
