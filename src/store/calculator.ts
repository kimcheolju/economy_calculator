/**
 * 입력 상태 스토어 (design/04-data-model.md §5, ADR-6)
 *
 * CalculatorInput 단일 객체만 상태로 두고 결과는 파생값으로 계산한다.
 * 결과를 상태에 저장하지 않으므로 입력과 결과가 불일치할 수 없다.
 */

import { create } from 'zustand'
import type { CalculatorInput } from '@/calc/types'
import { DEFAULT_INPUT } from '@/lib/defaults'
import { validateInput, type ValidationErrors } from '@/lib/schema'
import { clearLocalStorage, decodeInput, loadFromLocalStorage, saveToLocalStorage } from '@/lib/url-codec'

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (infer U)[] ? U[] : T[K] extends object ? DeepPartial<T[K]> : T[K]
}

function applyPatch<T>(base: T, patch: DeepPartial<T>): T {
  const out = { ...(base as Record<string, unknown>) }
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    const current = out[key]
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      current !== null &&
      typeof current === 'object' &&
      !Array.isArray(current)
    ) {
      out[key] = applyPatch(current, value as DeepPartial<unknown>)
    } else {
      out[key] = value
    }
  }
  return out as T
}

interface CalculatorStore {
  input: CalculatorInput
  validationErrors: ValidationErrors
  /** 저장된 설정을 불러오지 못했을 때 사용자에게 알린다 */
  loadNotice: string | null

  patch(patch: DeepPartial<CalculatorInput>): void
  setInput(input: CalculatorInput): void
  reset(): void
  clearSaved(): void
  dismissNotice(): void
}

let saveTimer: ReturnType<typeof setTimeout> | undefined

function persist(input: CalculatorInput): void {
  if (saveTimer !== undefined) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => saveToLocalStorage(input), 1000)
}

export const useCalculatorStore = create<CalculatorStore>((set, get) => ({
  input: DEFAULT_INPUT,
  validationErrors: {},
  loadNotice: null,

  patch(patch) {
    const next = applyPatch(get().input, patch)
    set({ input: next, validationErrors: validateInput(next) })
    persist(next)
  },

  setInput(input) {
    set({ input, validationErrors: validateInput(input) })
    persist(input)
  },

  reset() {
    set({ input: DEFAULT_INPUT, validationErrors: {}, loadNotice: null })
    persist(DEFAULT_INPUT)
  },

  clearSaved() {
    clearLocalStorage()
    set({ input: DEFAULT_INPUT, validationErrors: {}, loadNotice: '저장된 데이터를 삭제했습니다.' })
  },

  dismissNotice() {
    set({ loadNotice: null })
  },
}))

/** 앱 시작 시 URL → localStorage 순으로 상태를 복원한다 */
export async function hydrateStore(search: string): Promise<void> {
  if (search && search.length > 1) {
    const { input, ok } = await decodeInput(search)
    if (ok) {
      useCalculatorStore.setState({ input, validationErrors: validateInput(input) })
      return
    }
    useCalculatorStore.setState({
      loadNotice: '공유 링크를 해석할 수 없어 기본값을 사용합니다.',
    })
  }

  const stored = loadFromLocalStorage()
  if (stored) {
    useCalculatorStore.setState({ input: stored, validationErrors: validateInput(stored) })
  }
}
