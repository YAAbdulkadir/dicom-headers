import { ThemeTokens } from './themes'

export function applyTokens(tokens: ThemeTokens) {
    const root = document.documentElement
    for (const [k, v] of Object.entries(tokens)) {
        root.style.setProperty(`--${k}`, String(v))
    }
}