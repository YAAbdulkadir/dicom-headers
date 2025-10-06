// src/renderer/HeadersWindow.tsx
import React from 'react'
import { HeaderNode, HeaderTree } from './components/Headers'

type InstanceInfo = { path: string; sop?: string; instanceNumber?: number; date?: string; time?: string }
type SeriesOpenPayload = {
  seriesKey: string
  title: string
  instances: InstanceInfo[]
  tabKey?: string
  activate?: boolean
}

declare global {
  interface Window {
    api: {
      onHeadersAddTab: (cb: (p: SeriesOpenPayload) => void) => () => void
      getHeaders: (path: string, options: any) => Promise<HeaderNode[]>
      winMinimize: () => Promise<void>
      winMaximize: () => Promise<void>
      winClose: () => Promise<void>
      pingHeaders?: () => Promise<void>
      copyText?: (text: string) => Promise<boolean>

      // Native tab context menu — single-argument shape { tab, screenPos, payload }
      showTabContextMenu?: (args: {
        tab: { id: string; title: string; firstPath?: string }
        screenPos: { x: number; y: number }
        payload?: SeriesOpenPayload
      }) => Promise<'copyPath' | 'splitRight' | 'splitLeft' | 'openInNewWindow' | 'cancel'>

      // Optional explicit path (not required if main handles it from the menu)
      openSeriesInNewWindow?: (payload: SeriesOpenPayload) => Promise<boolean>
    }
  }
}

const mono: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
}

/* ---------------------- Small utilities ---------------------- */
function fmtDate(d?: string | null) {
  return d && d.length >= 8 ? `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}` : (d ?? '—')
}
function fmtTime(t?: string | null) {
  if (!t) return '—'
  const hh = t.slice(0,2) || '', mm = t.slice(2,4) || '', ss = t.slice(4,6) || ''
  const frac = t.length > 6 ? t.slice(6) : ''
  const core = [hh, mm, ss].filter(Boolean).join(':')
  return core + frac
}

/* ---------------------- Window controls ---------------------- */
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

function TitleBar() {
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
      <div style={{ opacity: 0.7, fontSize: 13 }}>DICOM Headers</div>
      <div style={{ display: 'flex', gap: 6, WebkitAppRegion: 'no-drag' as any }}>
        <WinBtn label="—" title="Minimize" onClick={() => window.api.winMinimize()} />
        <WinBtn label="▢" title="Max/Restore" onClick={() => window.api.winMaximize()} />
        <WinBtn label="×" title="Close" danger onClick={() => window.api.winClose()} />
      </div>
    </div>
  )
}

/* ---------------------- Tabs state ---------------------- */
type Tab = {
  id: string
  seriesKey: string
  title: string
  instances: InstanceInfo[]
  activeIdx: number
  loading: boolean
  error?: string
  cache: Record<number, HeaderNode[]>
  tabKey?: string
}

function useTabManager() {
  const [tabs, setTabs] = React.useState<Tab[]>([])
  const [activeId, setActiveId] = React.useState<string | null>(null)

  const loadInstance = React.useCallback((tabId: string, idx: number, filePath: string) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, loading: true, error: undefined } : t))
    window.api.getHeaders(filePath, { ignorePrivate: true, ignoreBulk: true, redactPHI: true })
      .then(nodes => {
        setTabs(prev => prev.map(t => {
          if (t.id !== tabId) return t
          const cache = { ...t.cache, [idx]: nodes }
          return { ...t, cache, activeIdx: idx, loading: false }
        }))
      })
      .catch(err => {
        setTabs(prev => prev.map(t => t.id === tabId ? { ...t, loading: false, error: String(err) } : t))
      })
  }, [])

  React.useEffect(() => {
    const off = window.api.onHeadersAddTab((p: SeriesOpenPayload) => {
      console.log('[renderer] onHeadersAddTab <-', {
        seriesKey: p.seriesKey,
        title: p.title,
        n: p.instances?.length,
        tabKey: p.tabKey
      })
      setTabs(prev => {
        const existing = prev.find(t => t.seriesKey === p.seriesKey)
        if (existing) {
          console.log('[renderer] tab exists; activate?', p.activate)
          if (p.activate) setActiveId(existing.id)
          return prev
        }

        const id = p.tabKey || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        console.log('[renderer] creating new tab', { id })
        const next: Tab = {
          id,
          seriesKey: p.seriesKey,
          title: p.title || 'Series',
          instances: p.instances || [],
          activeIdx: 0,
          loading: false,
          cache: {},
          tabKey: p.tabKey || id,
        }

        const first = next.instances[0]
        const withLoading = first ? { ...next, loading: true } : next
        if (first) {
          console.log('[renderer] will load first instance', first.path)
          setTimeout(() => loadInstance(id, 0, first.path), 0)
        }

        if (p.activate) setActiveId(id)
        else if (!prev.length) setActiveId(id)

        return [...prev, withLoading]
      })
    })

    window.api.pingHeaders?.() // flush queue from main
    return () => { off && off() }
  }, [loadInstance])

  React.useEffect(() => {
    if (!activeId && tabs[0]) setActiveId(tabs[0].id)
  }, [tabs, activeId])

  const active = tabs.find(t => t.id === activeId)

  React.useEffect(() => {
    if (!active) return
    if (active.instances.length === 0) return
    const idx = active.activeIdx ?? 0
    const inst = active.instances[idx] || active.instances[0]
    const finalIdx = active.instances[idx] ? idx : 0
    if (!active.cache[finalIdx]) loadInstance(active.id, finalIdx, inst.path)
  }, [active?.id, active?.activeIdx, active?.instances.length, loadInstance])

  function closeTab(id: string) {
    setTabs(prev => prev.filter(t => t.id !== id))
    setActiveId(cur => {
      if (cur !== id) return cur
      const remaining = tabs.filter(t => t.id !== id)
      return remaining.length ? remaining[remaining.length - 1].id : null
    })
  }

  return { tabs, setTabs, activeId, setActiveId, closeTab, loadInstance }
}

/* ---------------------- Tab button ---------------------- */
function TabButton({
  active,
  title,
  onClick,
  onClose,
  onContextMenu,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
  onClose: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const [hover, setHover] = React.useState(false)

  const base: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    height: 32,
    borderRadius: '8px 8px 0 0',
    cursor: 'pointer',
    userSelect: 'none',
    transition: 'background 120ms ease, border-color 120ms ease, color 120ms ease',
    maxWidth: 320,
    marginBottom: -1,
    position: 'relative',
    WebkitAppRegion: 'no-drag',
  }

  const activeStyle: React.CSSProperties = {
    background: '#0b0f14',
    borderTop: '1px solid #1f2630',
    borderLeft: '1px solid #1f2630',
    borderRight: '1px solid #1f2630',
    borderBottom: '0',
    color: '#e6edf3',
    zIndex: 2,
    boxShadow: '0 1px 0 0 #0b0f14 inset',
  }

  const inactiveBorder = hover ? '#1b2330' : '#141a22'
  const inactiveStyle: React.CSSProperties = {
    background: hover ? '#141c27' : '#0e1420',
    border: `1px solid ${inactiveBorder}`,
    color: '#c6ced8',
    zIndex: 1,
  }

  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...base, ...(active ? activeStyle : inactiveStyle) }}
      title={title}
    >
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          paddingRight: 2,
        }}
      >
        {title}
      </span>

      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="Close tab"
        title="Close"
        style={{
          width: 18,
          height: 18,
          lineHeight: '14px',
          borderRadius: 4,
          border: `1px solid ${inactiveBorder}`,
          background: active ? '#101826' : hover ? '#0b0f14' : 'transparent',
          color: '#e6edf3',
          cursor: 'pointer',
          opacity: active ? 1 : hover ? 1 : 0,
          transition: 'opacity 120ms ease, background 120ms ease, border-color 120ms ease',
        }}
      >
        ×
      </button>
    </div>
  )
}

/* ---------------------- Copyable cell (instances table) ---------------------- */
function CopyCell({
  text,
  children,
  title,
  style,
}: {
  text: string
  children?: React.ReactNode
  title?: string
  style?: React.CSSProperties
}) {
  const [copied, setCopied] = React.useState(false)

  async function onCopy(e: React.MouseEvent) {
    await window.api.copyText?.(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 900)
    e.stopPropagation()
  }

  return (
    <div
      onClick={onCopy}
      title={title || 'Click to copy'}
      style={{ position: 'relative', cursor: 'copy', ...style }}
    >
      <div style={{ pointerEvents: 'none' }}>{children ?? text}</div>
      {copied && (
        <div
          style={{
            position: 'absolute',
            right: 8,
            top: 4,
            fontSize: 10,
            padding: '2px 6px',
            border: '1px solid #2a3442',
            background: '#101826',
            color: '#b8c2d1',
            borderRadius: 6,
            pointerEvents: 'none',
          }}
        >
          Copied!
        </div>
      )}
    </div>
  )
}

/* ---------------------- Main component ---------------------- */
export default function HeadersWindow() {
  React.useEffect(() => {
    console.log('[renderer] HeadersWindow mounted; saying hello to main');
    (async () => {
      try {
        await window.api.helloNewHeadersWindow?.();
      } catch (e) {
        console.warn('[renderer] helloNewHeadersWindow failed', e);
      }
    })();
  }, []);
  const { tabs, setTabs, activeId, setActiveId, closeTab, loadInstance } = useTabManager()
  const active = tabs.find(t => t.id === activeId) || tabs[0]

  function selectInstance(idx: number) {
    if (!active) return
    const inst = active.instances[idx]
    if (!inst) return
    if (active.cache[idx]) {
      setTabs(prev => prev.map(t => t.id === active.id ? { ...t, activeIdx: idx, error: undefined } : t))
    } else {
      loadInstance(active.id, idx, inst.path)
    }
  }

  async function onTabContextMenu(tab: Tab, e: React.MouseEvent) {
    e.preventDefault()
    if (!window.api.showTabContextMenu) {
      console.warn('[renderer] showTabContextMenu not exposed from preload')
      return
    }

    const firstPath = tab.instances?.[0]?.path

    // IMPORTANT: include payload so main can enable “Open in New Window”
    const payload: SeriesOpenPayload = {
      seriesKey: tab.seriesKey,
      title: tab.title,
      instances: tab.instances,
      tabKey: tab.tabKey || tab.id,
      activate: true,
    }

    const args = {
      tab: { id: tab.id, title: tab.title, firstPath },
      screenPos: { x: e.screenX, y: e.screenY }, // screen coords for popup
      payload,
    }

    console.log('[renderer] calling showTabContextMenu with', { ...args, payload: { ...payload, instances: `(${payload.instances.length} items)` } })
    try {
      const choice = await window.api.showTabContextMenu(args as any)
      console.log('[renderer] menu choice ->', choice)
      // main handles copy/open; nothing else needed here
    } catch (err) {
      console.warn('[renderer] showTabContextMenu threw', err)
    }
  }

  const nodes: HeaderNode[] | undefined =
    active && active.cache[active.activeIdx] ? active.cache[active.activeIdx] : undefined

  const th = { padding: '6px 8px', color: '#a7b0be', textAlign: 'center' as const }
  const cellMono: React.CSSProperties = {
    ...mono,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    textAlign: 'center',
  }

  return (
    <div
      style={{
        fontFamily: 'ui-sans-serif, system-ui',
        color: '#e6edf3',
        background: '#0b0f14',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        minHeight: 0,
      }}
    >
      <TitleBar />

      {/* Tabs */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-end',
          gap: 6,
          padding: '0 8px',
          paddingTop: 8,
          background: '#0b0f14',
          borderBottom: '0',
          flexShrink: 0,
          minWidth: 0,
          WebkitAppRegion: 'no-drag',
        }}
      >
        {/* underline behind all tabs */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 1,
            background: '#141a22',
            zIndex: 0,
            pointerEvents: 'none',
          }}
        />
        {tabs.map((t) => (
          <TabButton
            key={t.id}
            active={t.id === active?.id}
            title={t.title}
            onClick={() => setActiveId(t.id)}
            onClose={() => closeTab(t.id)}
            onContextMenu={(e) => onTabContextMenu(t, e)}
          />
        ))}
        <div style={{ marginLeft: 'auto', color: '#a7b0be', fontSize: 12, paddingBottom: 6 }}>
          {tabs.length ? `${tabs.length} tab${tabs.length > 1 ? 's' : ''}` : 'Open a header from the main window'}
        </div>
      </div>

      {/* Content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          padding: 12,
          minHeight: 0,
          minWidth: 0,
          overflow: 'hidden',
          borderTop: '1px solid #1f2630',
        }}
      >
        {active ? (
          <>
            {/* Instances */}
            <div style={{ border: '1px solid #1f2630', borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '56px 1fr 120px 120px 120px 2fr',
                  padding: '6px 8px',
                  borderBottom: '1px solid #1f2630',
                }}
              >
                <div style={th}>#</div>
                <div style={th}>SOPInstanceUID</div>
                <div style={th}>Instance</div>
                <div style={th}>Date</div>
                <div style={th}>Time</div>
                <div style={th}>Path</div>
              </div>
              <div style={{ maxHeight: 160, overflow: 'auto' }}>
                {active.instances.map((inst: any, i: number) => {
                  const selected = i === active.activeIdx

                  const sop = inst.sop || '—'
                  const instanceStr = inst.instanceNumber ?? '—'
                  const dateStr = fmtDate(inst.date)
                  const timeStr = fmtTime(inst.time)
                  const pathStr = inst.path

                  return (
                    <div
                      key={i}
                      onClick={() => selectInstance(i)}
                      title={inst.path}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '56px 1fr 120px 120px 120px 2fr',
                        padding: '6px 8px',
                        borderBottom: '1px solid #1f2630',
                        background: selected ? '#121822' : i % 2 === 0 ? 'transparent' : '#0e1420',
                        cursor: 'pointer',
                      }}
                    >
                      <CopyCell text={String(i + 1)} style={cellMono} title="Copy row #">
                        {i + 1}
                      </CopyCell>
                      <CopyCell text={sop} style={cellMono} title="Copy SOPInstanceUID">
                        {sop}
                      </CopyCell>
                      <CopyCell text={String(instanceStr)} style={cellMono} title="Copy Instance Number">
                        {instanceStr}
                      </CopyCell>
                      <CopyCell text={dateStr} style={cellMono} title="Copy Date">
                        {dateStr}
                      </CopyCell>
                      <CopyCell text={timeStr} style={cellMono} title="Copy Time">
                        {timeStr}
                      </CopyCell>
                      <CopyCell text={pathStr} style={cellMono} title="Copy full path">
                        {pathStr}
                      </CopyCell>
                    </div>
                  )
                })}
                {active.instances.length === 0 && (
                  <div style={{ padding: '8px 10px', color: '#a7b0be' }}>No instances in this series.</div>
                )}
              </div>
            </div>

            {/* Headers */}
            <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', overflow: 'hidden' }}>
              {active.loading && !nodes && <div>Loading headers…</div>}
              {active.error && <div style={{ color: '#ef4444' }}>Error: {active.error}</div>}
              {nodes && (
                <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <HeaderTree nodes={nodes} initialOpen={false} fillHeight />
                </div>
              )}
              {!active.loading && !nodes && !active.error && (
                <div style={{ opacity: 0.7 }}>Select an instance above to view headers.</div>
              )}
            </div>
          </>
        ) : (
          <div style={{ opacity: 0.7 }}>No tabs open.</div>
        )}
      </div>
    </div>
  )
}
