export type ThemeTokens = {
  // required (used across the UI)
    bg: string; 
    fg: string; 
    panel: string; 
    border: string; 
    muted: string;
    accent: string;
    danger: string; 
    shadow: string; 
    radius: string;

    // optional extras
    accentAlt?: string;
    success?: string;
    warning?: string;
    info?: string;
    selection?: string;
    scrollbar?: string;
    scrollbarThumb?: string;
    scrollbarTrack?: string;
    scrollbarThumbHover?: string;
    scrollbarThumbActive?: string;
    link?: string;
    codeKeyword?: string;
    codeString?: string;
    codeNumber?: string;
};

export const THEMES: Record<string, ThemeTokens> = {
  light: {
    bg: '#ffffff', 
    fg: '#111111', 
    panel: '#f9fafb', 
    border: '#e5e7eb',
    muted: '#6b7280', 
    accent: '#2563eb', 
    danger: '#dc2626',
    shadow: '0 1px 2px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.1)',
    radius: '12px',
    scrollbarTrack: '#f3f4f6',
    scrollbarThumb: '#cbd5e1',
    scrollbarThumbHover: '#94a3b8',
    scrollbarThumbActive: '#64748b',
  },
  midnightSlate: {
    bg: '#0f1115', 
    fg: '#e5e7eb', 
    panel: '#111827', 
    border: '#1f2937',
    muted: '#94a3b8', 
    accent: '#60a5fa', 
    danger: '#f87171',
    shadow: '0 1px 2px rgba(0,0,0,0.4), 0 1px 3px rgba(0,0,0,0.6)',
    radius: '12px',
    scrollbarTrack: '#161b22',
    scrollbarThumb: '#3a3f4b',     
    scrollbarThumbHover: '#4b5563',
    scrollbarThumbActive: '#64748b',
  },
  dark: {
    bg: '#1E1E1E',
    panel: '#252526',
    fg: '#D4D4D4',
    border: '#333333',
    muted: '#A6A6A6',
    accent: '#007ACC',
    accentAlt: '#569CD6',
    danger: '#F14C4C',
    shadow: '0 1px 2px rgba(0,0,0,0.35), 0 2px 6px rgba(0,0,0,0.45)',
    radius: '12px',
    success: '#89D185',
    warning: '#CCA700',
    info: '#9CDCFE',
    selection: '#264F78',
    scrollbarTrack: '#2a2a2a',
    scrollbarThumb: '#5a5a5a',
    scrollbarThumbHover: '#6b6b6b',
    scrollbarThumbActive: '#808080',
    link: '#3794FF',
    codeKeyword: '#C586C0',
    codeString: '#CE9178',
    codeNumber: '#B5CEA8',
  },

  oled: {
    // true black for OLED panels
    bg: '#000000', 
    panel: '#0A0A0A', 
    fg: '#E6E6E6', 
    border: '#1A1A1A',
    muted: '#9AA0A6', 
    accent: '#5EA0FF', 
    danger: '#FF6B6B',
    shadow: 'none', 
    radius: '12px',
    selection: '#13324A',
    scrollbarTrack: '#0A0A0A',
    scrollbarThumb: '#242424',
    scrollbarThumbHover: '#2E2E2E',
    scrollbarThumbActive: '#3A3A3A',
    link: '#58A6FF',
  },

  dim: {
    // low-contrast dark (easy on eyes)
    bg: '#121417', 
    panel: '#171A1E', 
    fg: '#D8DEE9', 
    border: '#242933',
    muted: '#9AA7B2', 
    accent: '#7AA2F7', 
    danger: '#EE6D85',
    shadow: '0 1px 2px rgba(0,0,0,.35), 0 2px 6px rgba(0,0,0,.45)',
    radius: '12px',
    selection: '#243246',
    scrollbarTrack: '#1A1E24',
    scrollbarThumb: '#2C3440',
    scrollbarThumbHover: '#354054',
    scrollbarThumbActive: '#41506A',
    link: '#8AADF4',
  },

  highContrast: {
    // accessible, strong separation
    bg: '#000000', 
    panel: '#0E0E0E', 
    fg: '#FFFFFF', 
    border: '#FFFFFF',
    muted: '#C0C0C0', 
    accent: '#00FFFF', 
    danger: '#FF0033',
    shadow: '0 0 0 2px rgba(255,255,255,.2)',
    radius: '0px',
    selection: '#00FFFF33',
    scrollbarTrack: '#000000',
    scrollbarThumb: '#FFFFFF',
    scrollbarThumbHover: '#E5E5E5',
    scrollbarThumbActive: '#CCCCCC',
    link: '#66FFFF',
  },

  nord: {
    // Nord palette vibes
    bg: '#2E3440', 
    panel: '#3B4252', 
    fg: '#ECEFF4', 
    border: '#434C5E',
    muted: '#D8DEE9', 
    accent: '#88C0D0', 
    danger: '#BF616A',
    shadow: '0 1px 2px rgba(0,0,0,.35), 0 2px 6px rgba(0,0,0,.45)',
    radius: '12px',
    selection: '#4C566A',
    scrollbarTrack: '#3B4252',
    scrollbarThumb: '#4C566A',
    scrollbarThumbHover: '#5B677A',
    scrollbarThumbActive: '#6B7A91',
    link: '#81A1C1',
    codeKeyword: '#81A1C1', 
    codeString: '#A3BE8C', 
    codeNumber: '#B48EAD',
  },

  dracula: {
    // Dracula-inspired
    bg: '#282A36', 
    panel: '#1E1F29', 
    fg: '#F8F8F2', 
    border: '#44475A',
    muted: '#CED1E6', 
    accent: '#BD93F9', 
    danger: '#FF5555',
    shadow: '0 1px 2px rgba(0,0,0,.35), 0 2px 6px rgba(0,0,0,.45)',
    radius: '12px',
    selection: '#44475A',
    scrollbarTrack: '#1E1F29',
    scrollbarThumb: '#3B3E51',
    scrollbarThumbHover: '#4A4E66',
    scrollbarThumbActive: '#5A5F7B',
    link: '#8BE9FD',
    codeKeyword: '#FF79C6', 
    codeString: '#F1FA8C', 
    codeNumber: '#BD93F9',
  },

  solarizedLight: {
    // Solarized Light
    bg: '#FDF6E3', 
    panel: '#F5EAD0', 
    fg: '#586E75', 
    border: '#E5DCC5',
    muted: '#93A1A1', 
    accent: '#268BD2', 
    danger: '#DC322F',
    shadow: '0 1px 2px rgba(0,0,0,.06), 0 1px 3px rgba(0,0,0,.1)',
    radius: '12px',
    selection: '#DDE8C6',
    scrollbarTrack: '#EFE6D1',
    scrollbarThumb: '#D6CCB6',
    scrollbarThumbHover: '#C5BBA6',
    scrollbarThumbActive: '#B4AA95',
    link: '#268BD2',
    codeKeyword: '#859900', 
    codeString: '#2AA198', 
    codeNumber: '#CB4B16',
  },

  solarizedDark: {
    // Solarized Dark
    bg: '#002B36', 
    panel: '#073642', 
    fg: '#EAEAEA', 
    border: '#0B3742',
    muted: '#93A1A1', 
    accent: '#268BD2', 
    danger: '#DC322F',
    shadow: '0 1px 2px rgba(0,0,0,.35), 0 2px 6px rgba(0,0,0,.45)',
    radius: '12px',
    selection: '#0E4A57',
    scrollbarTrack: '#073642',
    scrollbarThumb: '#0F4B57',
    scrollbarThumbHover: '#145969',
    scrollbarThumbActive: '#1A697C',
    link: '#43A6DD',
    codeKeyword: '#B58900', 
    codeString: '#2AA198', 
    codeNumber: '#CB4B16',
  },

} satisfies Record<string, ThemeTokens>;

export type BuiltInThemeName = keyof typeof THEMES
export type ThemeSource = 'system' | 'light' | 'dark' | `custom:${string}`