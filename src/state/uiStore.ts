import { create } from 'zustand'
import { getThemePref, setThemePref, type ThemePref } from '../lib/theme'
import { hasPin } from '../lib/pin'

interface UiState {
  theme: ThemePref
  setTheme: (t: ThemePref) => void
  locked: boolean
  setLocked: (v: boolean) => void
  refreshLock: () => void
}

export const useUiStore = create<UiState>((set) => ({
  theme: getThemePref(),
  setTheme: (t) => {
    setThemePref(t)
    set({ theme: t })
  },
  locked: hasPin(), // si hay PIN, arranca bloqueada
  setLocked: (v) => set({ locked: v }),
  refreshLock: () => set({ locked: hasPin() }),
}))
