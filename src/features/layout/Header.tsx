import { useEffect, useRef, useState } from 'react'
import type { CalculationResult } from '@/calc/types'
import { Check, Image, Link, Monitor, Moon, More, Reset, Sun, Trash } from '@/components/display/Icon'
import { exportPng } from '@/lib/png-export'
import { encodeInput } from '@/lib/url-codec'
import { useCalculatorStore } from '@/store/calculator'

type Theme = 'light' | 'dark' | 'system'

function applyTheme(theme: Theme): void {
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', isDark)
}

const THEMES = [
  { value: 'light', label: '라이트', Icon: Sun },
  { value: 'system', label: '시스템', Icon: Monitor },
  { value: 'dark', label: '다크', Icon: Moon },
] as const

/**
 * 헤더는 얇게 유지한다. 액션 5개를 같은 무게로 나열하면 무엇이 중요한지
 * 알 수 없으므로, 공유만 노출하고 나머지는 오버플로 메뉴로 접는다
 * (design/08-design-system.md §5).
 */
export function Header({ result }: { result: CalculationResult | null }) {
  const input = useCalculatorStore((s) => s.input)
  const reset = useCalculatorStore((s) => s.reset)
  const clearSaved = useCalculatorStore((s) => s.clearSaved)

  const [theme, setTheme] = useState<Theme>('system')
  const [shareState, setShareState] = useState<'idle' | 'confirm' | 'copied' | 'failed'>('idle')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    applyTheme(theme)
    if (theme !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const listener = () => applyTheme('system')
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [theme])

  useEffect(() => {
    if (!menuOpen) return
    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  async function share() {
    // 공유 링크에는 입력한 금액이 포함되므로 사용자에게 먼저 알린다
    if (shareState !== 'confirm') {
      setShareState('confirm')
      return
    }
    try {
      const query = await encodeInput(input)
      const url = `${window.location.origin}${window.location.pathname}?${query}`
      await navigator.clipboard.writeText(url)
      window.history.replaceState(null, '', `?${query}`)
      setShareState('copied')
      setTimeout(() => setShareState('idle'), 3000)
    } catch {
      setShareState('failed')
      setTimeout(() => setShareState('idle'), 3000)
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-plane/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <h1 className="truncate text-body font-semibold tracking-tight text-ink">경제적 자유 계산기</h1>

        <div className="flex items-center gap-1.5">
          {shareState === 'copied' && (
            <span className="hidden items-center gap-1 text-caption text-success-text sm:flex">
              <Check className="size-3.5" />
              링크를 복사했습니다
            </span>
          )}
          {shareState === 'failed' && (
            <span className="hidden text-caption text-critical sm:block">복사에 실패했습니다</span>
          )}

          {/* 테마 — 3분할 아이콘 컨트롤 */}
          <div
            role="radiogroup"
            aria-label="테마"
            className="flex items-center gap-0.5 rounded-control bg-surface-sunken p-0.5"
          >
            {THEMES.map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={theme === value}
                aria-label={label}
                title={label}
                onClick={() => setTheme(value)}
                className={`rounded-[5px] p-1.5 transition-colors ${
                  theme === value
                    ? 'bg-surface text-ink shadow-raised'
                    : 'text-ink-muted hover:text-ink-secondary'
                }`}
              >
                <Icon className="size-4" />
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={share}
            className={`flex items-center gap-1.5 rounded-control px-2.5 py-1.5 text-caption font-medium transition-colors ${
              shareState === 'confirm'
                ? 'bg-warning/20 text-ink'
                : 'text-ink-secondary hover:bg-surface-sunken hover:text-ink'
            }`}
          >
            <Link className="size-4" />
            <span className="hidden sm:inline">
              {shareState === 'confirm' ? '금액이 포함됩니다 · 다시 누르기' : '공유'}
            </span>
          </button>

          {/* 나머지 액션 — 자주 쓰지 않으므로 접어 둔다 */}
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="더 보기"
              className={`rounded-control p-1.5 transition-colors ${
                menuOpen ? 'bg-surface-sunken text-ink' : 'text-ink-muted hover:bg-surface-sunken hover:text-ink'
              }`}
            >
              <More className="size-4" />
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 z-40 mt-1.5 w-52 overflow-hidden rounded-panel border border-rule bg-surface py-1 shadow-overlay"
              >
                <MenuItem
                  icon={<Image className="size-4" />}
                  disabled={!result}
                  onClick={() => {
                    setMenuOpen(false)
                    if (result) void exportPng(result)
                  }}
                >
                  이미지로 저장
                </MenuItem>
                <MenuItem
                  icon={<Reset className="size-4" />}
                  onClick={() => {
                    setMenuOpen(false)
                    reset()
                  }}
                >
                  입력값 초기화
                </MenuItem>
                <div className="my-1 border-t border-rule" />
                <MenuItem
                  icon={<Trash className="size-4" />}
                  onClick={() => {
                    setMenuOpen(false)
                    clearSaved()
                  }}
                  hint="이 기기에 저장된 입력값을 지웁니다"
                >
                  저장된 값 삭제
                </MenuItem>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 확인 단계·결과를 모바일에서도 볼 수 있게 한 줄 아래에 둔다 */}
      {(shareState === 'confirm' || shareState === 'copied' || shareState === 'failed') && (
        <p className="border-t border-rule px-4 py-1.5 text-caption text-ink-secondary sm:hidden">
          {shareState === 'confirm' && '링크에 입력한 금액이 포함됩니다. 계속하려면 다시 누르세요.'}
          {shareState === 'copied' && '링크를 복사했습니다'}
          {shareState === 'failed' && '복사에 실패했습니다'}
        </p>
      )}
    </header>
  )
}

function MenuItem({
  icon,
  children,
  hint,
  onClick,
  disabled,
}: {
  icon: React.ReactNode
  children: React.ReactNode
  hint?: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-start gap-2.5 px-3 py-2 text-left text-caption text-ink-secondary transition-colors hover:bg-surface-sunken hover:text-ink disabled:pointer-events-none disabled:opacity-40"
    >
      <span className="mt-px shrink-0 text-ink-muted">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block">{children}</span>
        {hint && <span className="mt-0.5 block text-micro text-ink-muted">{hint}</span>}
      </span>
    </button>
  )
}
