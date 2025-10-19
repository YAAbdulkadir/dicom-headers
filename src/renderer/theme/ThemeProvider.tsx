// src/renderer/theme/ThemeProvider.tsx
import React from 'react'
import { THEMES, ThemeSource, ThemeTokens } from './themes'
import { applyTokens } from './applyTokens'

type ThemeCtx = {
  themeSource: ThemeSource
  effective: 'light' | 'dark' | `custom:${string}` // what’s actually applied
  tokens: ThemeTokens
  setThemeSource: (t: ThemeSource) => Promise<void>
}

const ThemeContext = React.createContext<ThemeCtx>({
  themeSource: 'system',
  effective: 'light',
  tokens: THEMES.light,
  setThemeSource: async () => {},
})

export const useTheme = () => React.useContext(ThemeContext)

function resolveTokens(themeSource: ThemeSource, shouldUseDarkColors: boolean): { effective: ThemeCtx['effective']; tokens: ThemeTokens } {
  if (themeSource === 'system') {
    const effective = shouldUseDarkColors ? 'dark' : 'light'
    return { effective, tokens: THEMES[effective] }
  }
  if (themeSource === 'light' || themeSource === 'dark') {
    return { effective: themeSource, tokens: THEMES[themeSource] }
  }
  if (themeSource.startsWith('custom:')) {
    const key = themeSource.slice('custom:'.length)
    const tokens = THEMES[key] ?? THEMES.dark
    return { effective: `custom:${key}`, tokens }
  }
  return { effective: 'light', tokens: THEMES.light }
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeSource, setThemeSourceState] = React.useState<ThemeSource>('system')
  const [effective, setEffective] = React.useState<ThemeCtx['effective']>('light')
  const [tokens, setTokens] = React.useState<ThemeTokens>(THEMES.light)

  const apply = React.useCallback((src: ThemeSource, shouldUseDark: boolean) => {
    const { effective, tokens } = resolveTokens(src, shouldUseDark)
    setEffective(effective)
    setTokens(tokens)
    applyTokens(tokens)
    const meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null
    if (meta) meta.content = tokens.bg
    // helpful data attributes for debugging or CSS hooks
    document.documentElement.setAttribute('data-themeSource', src)
    document.documentElement.setAttribute('data-effectiveTheme', effective)
  }, [])

  // Initial load from main via preload
  React.useEffect(() => {
    let off: (() => void) | undefined
    ;(async () => {
      const payload = await window.api.theme.get()
      setThemeSourceState(payload.themeSource)
      apply(payload.themeSource, payload.shouldUseDarkColors)
      // Subscribe for updates (OS flips, other window changed theme, etc.)
      off = window.api.theme.onDidChange(p => {
        setThemeSourceState(p.themeSource)
        apply(p.themeSource, p.shouldUseDarkColors)
      })
    })()
    return () => off?.()
  }, [apply])

  const setThemeSource = React.useCallback(async (src: ThemeSource) => {
    const payload = await window.api.theme.set(src)
    setThemeSourceState(payload.themeSource)
    apply(payload.themeSource, payload.shouldUseDarkColors)
  }, [apply])

  return (
    <ThemeContext.Provider value={{ themeSource, effective, tokens, setThemeSource }}>
      {children}
    </ThemeContext.Provider>
  )
}
