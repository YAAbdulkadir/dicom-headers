export type ThemeTokens = {
    bg: string; fg: string; panel: string; border: string; muted: string;
    accent: string; danger: string; shadow: string; radius: string;
}

export const THEMES: Record<string, ThemeTokens> = {
  light: {
    bg: '#ffffff', fg: '#111111', panel: '#f9fafb', border: '#e5e7eb',
    muted: '#6b7280', accent: '#2563eb', danger: '#dc2626',
    shadow: '0 1px 2px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.1)',
    radius: '12px',
  },
  dark: {
    bg: '#0f1115', fg: '#e5e7eb', panel: '#111827', border: '#1f2937',
    muted: '#94a3b8', accent: '#60a5fa', danger: '#f87171',
    shadow: '0 1px 2px rgba(0,0,0,0.4), 0 1px 3px rgba(0,0,0,0.6)',
    radius: '12px',
  },
  // Add more themes by just inserting new keys:
  // oled: { bg:'#000000', fg:'#e6e6e6', panel:'#000000', border:'#1a1a1a', muted:'#9aa0a6', accent:'#5ea0ff', danger:'#ff6b6b', shadow:'none', radius:'12px' },
  // dim:  { ... },
  // highContrast: { ... },
}

export type BuiltInThemeName = keyof typeof THEMES
export type ThemeSource = 'system' | 'light' | 'dark' | `custom:${string}`