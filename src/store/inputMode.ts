/**
 * 입력 패널 밀도 (design/05-ui-ux.md §2 "입력 밀도")
 *
 * CalculatorInput 과 분리해서 둔다 — 공유 링크나 저장 데이터에 담기면
 * 링크를 받은 사람의 화면 선호까지 덮어쓰게 된다. 계산에는 전혀 영향이 없다.
 */

import { create } from 'zustand'

export type InputMode = 'simple' | 'detailed'

const STORAGE_KEY = 'economy-calculator:input-mode:v1'

/** 처음 오는 사용자는 항상 간단 모드에서 시작한다 */
function loadMode(): InputMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'detailed' ? 'detailed' : 'simple'
  } catch {
    // 시크릿 모드 등에서 실패할 수 있다
    return 'simple'
  }
}

interface InputModeStore {
  mode: InputMode
  setMode(mode: InputMode): void
}

export const useInputModeStore = create<InputModeStore>((set) => ({
  mode: loadMode(),

  setMode(mode) {
    try {
      localStorage.setItem(STORAGE_KEY, mode)
    } catch {
      // 저장 실패해도 이번 세션에서는 동작해야 한다
    }
    set({ mode })
  },
}))
