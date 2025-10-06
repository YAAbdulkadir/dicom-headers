import React from 'react'

type AppInfo = {
  name: string
  version: string
  author?: string
  homepage?: string
}

declare global {
  interface Window {
    api: {
      getAppIcon?: () => Promise<string | null>
      getAppInfo?: () => Promise<AppInfo>
      openExternal?: (url: string) => Promise<boolean>
      winClose?: () => Promise<void>
    }
  }
}

export default function AboutWindow() {
  const [iconUrl, setIconUrl] = React.useState<string | null>(null)
  const [info, setInfo] = React.useState<AppInfo | null>(null)

  React.useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const [icon, meta] = await Promise.all([
          window.api.getAppIcon?.(),
          window.api.getAppInfo?.(),
        ])
        if (!mounted) return
        setIconUrl(icon ?? null)
        setInfo(meta ?? null)
      } catch {/* noop */}
    })()
    return () => { mounted = false }
  }, [])

  const label = (k: string) => (
    <div style={{ width: 88, color: '#99a3b3', textAlign: 'right', paddingRight: 12 }}>{k}</div>
  )

  return (
    <div
      style={{
        fontFamily: 'ui-sans-serif, system-ui',
        background: '#0b0f14',
        color: '#e6edf3',
        width: 420,
        minHeight: 220,
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid #1f2630',
        borderRadius: 10,
        overflow: 'hidden',
      }}
    >
      {/* simple top bar */}
      <div
        style={{
          height: 34,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 8px',
          borderBottom: '1px solid #1f2630',
          WebkitAppRegion: 'drag' as any,
        }}
      >
        <div style={{ opacity: 0.75, fontSize: 13 }}>About</div>
        <button
          onClick={() => window.api.winClose?.()}
          title="Close"
          style={{
            WebkitAppRegion: 'no-drag',
            width: 24, height: 24, lineHeight: '20px', borderRadius: 6,
            border: '1px solid #1f2630', background: '#0e1420', color: '#e6edf3', cursor: 'pointer'
          }}
        >
          ×
        </button>
      </div>

      {/* content */}
      <div style={{ padding: 16, display: 'flex', gap: 14 }}>
        {iconUrl && (
          <img
            src={iconUrl}
            width={48}
            height={48}
            alt="App icon"
            style={{ borderRadius: 8, flexShrink: 0 }}
          />
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>
            {info?.name ?? 'DICOM Headers'}
          </div>

          <div style={{ display: 'flex', alignItems: 'center' }}>
            {label('Version')}
            <div>{info?.version ?? '—'}</div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center' }}>
            {label('Author')}
            <div>{info?.author || '—'}</div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center' }}>
            {label('Website')}
            {info?.homepage ? (
              <button
                onClick={() => info?.homepage && window.api.openExternal?.(info.homepage)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#6bb2ff',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: 0,
                }}
                title={info.homepage}
              >
                {info.homepage}
              </button>
            ) : (
              <div>—</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
