import { ThemeTokens } from './themes'

export function applyTokens(tokens: ThemeTokens) {
  const root = document.documentElement

  // Apply all defined tokens
  for (const [k, v] of Object.entries(tokens)) {
    root.style.setProperty(`--${k}`, String(v))
  }

  // Optional: ensure scrollbar variables always exist
  if (!('scrollbarTrack' in tokens))
    root.style.setProperty('--scrollbarTrack', tokens.panel)
  if (!('scrollbarThumb' in tokens))
    root.style.setProperty('--scrollbarThumb', tokens.border)
  if (!('scrollbarThumbHover' in tokens))
    root.style.setProperty('--scrollbarThumbHover', tokens.border)
  if (!('scrollbarThumbActive' in tokens))
    root.style.setProperty('--scrollbarThumbActive', tokens.border)
}