import React from 'react'
import { useTheme } from '../theme/ThemeProvider'

declare global {
  interface Window {
    api: {
      getAppIcon?: () => Promise<string | null>
      openAbout?: () => Promise<boolean>
      winMinimize: () => Promise<void>
      winMaximize: () => Promise<void>
      winClose: () => Promise<void>
    }
  }
}

function WinBtn({
  label, title, onClick, danger = false
}: { label: string; title?: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        width: 36, 
        height: 24, 
        borderRadius: 6, 
        border: '1px solid var(--border)', /*#1f2630'*/
        background: 'transparent', //danger ? '#1b0f13' : '#0e1420', 
        color: danger ? 'var(--danger)' : 'var(--fg)', //danger ? '#ff6b6b' : '#e6edf3',
        cursor: 'pointer', 
        lineHeight: '20px'
      }}
    >
      {label}
    </button>
  )
}

function ThemeSelector() {
  const { themeSource, setThemeSource } = useTheme()
  return (
    <select
      aria-label="Theme"
      value={themeSource}
      onChange={e => setThemeSource(e.target.value as any)}
      className="themed-select"
      style={{ padding: '4px 8px', height: 28 }}
      title="Theme"
    >
      <option value="system">System</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
      {/* add any registry themes here */}
      <option value="custom:midnightSlate">Midnight Slate</option>
      <option value="custom:oled">OLED</option>
      <option value="custom:dim">Dim</option>
      <option value="custom:nord">Nord</option>
      <option value="custom:dracula">Dracula</option>
      <option value="custom:solarizedLight">Solarized Light</option>
      <option value="custom:SolarizedDark">Solarized Dark</option>
      <option value="custom:highContrast">High Contrast</option>
    </select>
  )
}

export default function TitleBar({ title = 'DICOM Headers' }: { title?: string }) {
  const [iconUrl, setIconUrl] = React.useState<string | null>(null)

  React.useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const url = await window.api.getAppIcon?.()
        if (mounted) setIconUrl(url ?? null)
      } catch {/* noop */}
    })()
    return () => { mounted = false }
  }, [])

  return (
    <div
      style={{
        height: 36,
        WebkitAppRegion: 'drag' as any,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 8px',
        background: 'var(--panel)', //'#0b0f14',
        borderBottom: '1px solid var(--border)', //'1px solid #1f2630',
        position: 'sticky', top: 0, zIndex: 10
      }}
    >
      {/* Left: icon + title (non-draggable so clicks work) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, WebkitAppRegion: 'no-drag' as any }}>
        {iconUrl && (
          <img
            src={iconUrl}
            width={16}
            height={16}
            alt="App icon"
            title="About DICOM Headers"
            style={{ cursor: 'pointer', borderRadius: 3 }}
            onClick={() => window.api.openAbout?.()}
          />
        )}
        <div style={{ opacity: 0.8, fontSize: 13, color: 'var(--fg)' }}>{title}</div>
      </div>

      {/* Right: window controls */}
      <div style={{ display: 'flex', gap: 8, WebkitAppRegion: 'no-drag' as any }}>
        <ThemeSelector/>
        <WinBtn label="—" title="Minimize" onClick={() => window.api.winMinimize()} />
        <WinBtn label="▢" title="Max/Restore" onClick={() => window.api.winMaximize()} />
        <WinBtn label="x" title="Close" danger onClick={() => window.api.winClose()} />
      </div>
    </div>
  )
}
