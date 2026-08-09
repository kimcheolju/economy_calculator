/**
 * 화면 안 이동 (CLAUDE.md §7 "모든 결과 카드에는 가정 패널로 가는 링크가 있어야 한다")
 *
 * 가정 패널은 페이지 맨 아래 접힌 섹션이라, 링크로 스크롤만 시키면 접힌 채로
 * 도착해 사용자가 도착했는지도 모른다. 열림 신호를 함께 보낸다.
 */

import { create } from 'zustand'

interface FocusStore {
  /** 증가할 때마다 가정 패널이 열린다 */
  assumptionsSignal: number
  revealAssumptions(): void
}

export const useFocusStore = create<FocusStore>((set, get) => ({
  assumptionsSignal: 0,

  revealAssumptions() {
    set({ assumptionsSignal: get().assumptionsSignal + 1 })
    // 열림 렌더를 기다렸다가 스크롤한다
    requestAnimationFrame(() => {
      document.getElementById('assumptions')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  },
}))
