import React from 'react'

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
        width: 36, height: 24, borderRadius: 6, border: '1px solid #1f2630',
        background: danger ? '#1b0f13' : '#0e1420', color: danger ? '#ff6b6b' : '#e6edf3',
        cursor: 'pointer', lineHeight: '20px'
      }}
    >
      {label}
    </button>
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
        background: '#0b0f14',
        borderBottom: '1px solid #1f2630',
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
        <div style={{ opacity: 0.7, fontSize: 13 }}>{title}</div>
      </div>

      {/* Right: window controls */}
      <div style={{ display: 'flex', gap: 6, WebkitAppRegion: 'no-drag' as any }}>
        <WinBtn label="—" title="Minimize" onClick={() => window.api.winMinimize()} />
        <WinBtn label="▢" title="Max/Restore" onClick={() => window.api.winMaximize()} />
        <WinBtn label="×" title="Close" danger onClick={() => window.api.winClose()} />
      </div>
    </div>
  )
}
