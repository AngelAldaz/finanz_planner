export type ThemePref = 'auto' | 'light' | 'dark'
const KEY = 'finanz-theme'

export function getThemePref(): ThemePref {
  const v = localStorage.getItem(KEY)
  return v === 'light' || v === 'dark' ? v : 'auto'
}

export function isDark(pref: ThemePref): boolean {
  if (pref === 'dark') return true
  if (pref === 'light') return false
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

export function applyTheme(pref: ThemePref): void {
  document.documentElement.classList.toggle('dark', isDark(pref))
}

export function setThemePref(pref: ThemePref): void {
  localStorage.setItem(KEY, pref)
  applyTheme(pref)
}
