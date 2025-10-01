// src/renderer/HeadersWindow.tsx
import React from 'react'
import { HeaderNode, HeaderTree } from './components/Headers'

// console.log('[headers] module loaded')

/** Instance reference passed from main */
type InstanceRef = { path: string; sop?: string; instanceNumber?: number; date?: string; time?: string }
type InstanceInfo = { path: string; sop?: string; instanceNumber?: number; date?: string; time?: string }
type SeriesOpenPayload = { seriesKey: string; title: string; instances: InstanceInfo[] }



/** Payload shapes we support from main (backward compatible) */
type AddTabPayload =
  | { filePath: string }                                 // old: single file
  | { instances: InstanceRef[]; title?: string }         // new: whole series

declare global {
  interface Window {
    api: {
      // Should return an unsubscribe function
      onHeadersAddTab: (cb: (p: AddTabPayload) => void) => () => void
      getHeaders: (path: string, options: any) => Promise<HeaderNode[]>
      winMinimize: () => Promise<void>
      winMaximize: () => Promise<void>
      winClose: () => Promise<void>
    }
  }
}

const mono: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
}

function WinBtn({ label, title, onClick, danger = false }:
  { label: string; title?: string; onClick: () => void; danger?: boolean }) {
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
        position: 'sticky',
        top: 0,
        zIndex: 10
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

/* ----------------------------- Tabs + Instances ----------------------------- */

type Tab = {
  id: string
  seriesKey: string
  title: string
  instances: InstanceInfo[]
  activeIdx: number
  loading: boolean
  error?: string
  cache: Record<number, HeaderNode[]>
}

function useTabManager() {
  const [tabs, setTabs] = React.useState<Tab[]>([])
  const [activeId, setActiveId] = React.useState<string | null>(null)

  // load a single instance lazily into cache
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
    // subscribe to 'add-tab' from main
    const off = window.api.onHeadersAddTab((p: SeriesOpenPayload) => {
      setTabs(prev => {
        const existing = prev.find(t => t.seriesKey === p.seriesKey)
        if (existing) {
          // focus existing
          setActiveId(existing.id)
          return prev
        }
        const id = `${Date.now()}_${Math.random().toString(36).slice(2,8)}`
        const next: Tab = {
          id,
          seriesKey: p.seriesKey,
          title: p.title || 'Series',
          instances: p.instances || [],
          activeIdx: 0,
          loading: false,
          cache: {}
        }
        // If we have at least one instance, kick off loading the first one
        if (next.instances.length > 0) {
          const first = next.instances[0]
          // mark loading true in the added tab
          const withLoading = { ...next, loading: true }
          setTimeout(() => loadInstance(id, 0, first.path), 0)
          setActiveId(id)
          return [...prev, withLoading]
        }
        setActiveId(id)
        return [...prev, next]
      })
    })
    return () => { off && off() }
  }, [loadInstance])

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
export default function HeadersWindow() {
  // Mount the tab manager FIRST so its internal onHeadersAddTab listener is registered.
  const { tabs, setTabs, activeId, setActiveId, closeTab, loadInstance } = useTabManager()

  // Flush any queued tabs from main after listener is ready
  React.useEffect(() => { window.api.pingHeaders?.() }, [])

  const active = tabs.find(t => t.id === activeId) || tabs[0]

  // Always have an active tab when tabs appear
  React.useEffect(() => {
    if (!activeId && tabs[0]) setActiveId(tabs[0].id)
  }, [tabs, activeId, setActiveId])

  // Auto-select/load first instance for a tab when it becomes active
  React.useEffect(() => {
    if (!active) return
    if (active.instances?.length && active.activeIdx == null) {
      const firstIdx = 0
      const first = active.instances[firstIdx]
      if (!first) return
      if (active.cache[firstIdx]) {
        setTabs(prev => prev.map(t => t.id === active.id ? { ...t, activeIdx: firstIdx, error: undefined } : t))
      } else {
        loadInstance(active.id, firstIdx, first.path)
      }
    }
  }, [active?.id, active?.instances?.length])

  function selectInstance(idx: number) {
    if (!active) return
    const inst = active.instances[idx]
    if (!inst) return
    if (active.cache[idx]) {
      const id = active.id
      setTabs(prev => prev.map(t => t.id === id ? { ...t, activeIdx: idx, error: undefined } : t))
    } else {
      loadInstance(active.id, idx, inst.path)
    }
  }

  // Light helpers for date/time display
  const fmtDate = (d?: string | null) =>
    (d && d.length >= 8 ? `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}` : (d ?? '—'))
  const fmtTime = (t?: string | null) => {
    if (!t) return '—'
    const hh = t.slice(0,2) || ''
    const mm = t.slice(2,4) || ''
    const ss = t.slice(4,6) || ''
    const frac = t.length > 6 ? t.slice(6) : ''
    const core = [hh, mm, ss].filter(Boolean).join(':')
    return core + frac
  }

  const nodes: HeaderNode[] | undefined =
    active && active.cache[active.activeIdx] ? active.cache[active.activeIdx] : undefined

  const mono: React.CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }
  const th = { padding: '6px 8px', color: '#a7b0be', textAlign: 'center' }
  const cellMono: React.CSSProperties = { ...mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center'}

  return (
    <div
      style={{
        fontFamily: 'ui-sans-serif, system-ui',
        color: '#e6edf3',
        background: '#0b0f14',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        // gridTemplateRows: 'auto auto 1fr', // TitleBar, Tabs, Content
        // overflow: 'hidden',                // ⬅️ prevent window-level scrollbars
        minWidth: 0,
        minHeight: 0,
      }}
    >
      <TitleBar />

      {/* Tabs bar (no sticky; grid handles layout) */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          padding: 8,
          borderBottom: '1px solid #1f2630',
          background: '#0b0f14',
          flexShrink: 0,
          minWidth: 0,                     // ⬅️ allow children to shrink
          minHeight: 0,
        }}
      >
        {tabs.map((t) => (
          <div
            key={t.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid #1f2630',
              background: t.id === active?.id ? '#121822' : '#0e1420',
              cursor: 'pointer',
            }}
            onClick={() => setActiveId(t.id)}
            title={t.title}
          >
            <span
              style={{
                maxWidth: 260,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {t.title}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); closeTab(t.id) }}
              style={{
                width: 18,
                height: 18,
                borderRadius: 4,
                border: '1px solid #1f2630',
                background: '#0b0f14',
                color: '#e6edf3',
                cursor: 'pointer',
                lineHeight: '14px',
              }}
            >
              ×
            </button>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', color: '#a7b0be', fontSize: 12 }}>
          {tabs.length ? `${tabs.length} tab${tabs.length > 1 ? 's' : ''}` : 'Open a header from the main window'}
        </div>
      </div>

      {/* CONTENT ROW: owns all scrolling */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          padding: 12,
          minHeight: 0,
          minWidth: 0,       // ⬅️ critical: prevents horizontal page scroll
          overflow: 'hidden' // ⬅️ contain any overflow to this row
        }}
      >
        {active ? (
          <>
            {/* Compact instance list (small, fixed-height, scrolls internally) */}
            <div style={{ border: '1px solid #1f2630', borderRadius: 8, overflow: 'hidden', flexShrink: 0}}>
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
                        background: selected ? '#121822' : 'transparent',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={cellMono}>{i + 1}</div>
                      <div style={cellMono}>{inst.sop || '—'}</div>
                      <div style={cellMono}>{inst.instanceNumber ?? '—'}</div>
                      <div style={cellMono}>{fmtDate(inst.date)}</div>
                      <div style={cellMono}>{fmtTime(inst.time)}</div>
                      <div style={cellMono}>{inst.path}</div>
                    </div>
                  )
                })}
                {active.instances.length === 0 && (
                  <div style={{ padding: '8px 10px', color: '#a7b0be' }}>No instances in this series.</div>
                )}
              </div>
            </div>

            {/* Header panel (fills the rest and owns both scrollbars via HeaderTree) */}
            <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', overflow: 'hidden' }}>
              {active.loading && !nodes && <div>Loading headers…</div>}
              {active.error && <div style={{ color: '#ef4444' }}>Error: {active.error}</div>}
              {nodes && (
                <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column'}}>
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

// export default function HeadersWindow() {
//   // Mount the tab manager FIRST so its internal onHeadersAddTab listener is registered.
//   const { tabs, setTabs, activeId, setActiveId, closeTab, loadInstance } = useTabManager()

//   // Now that the listener is mounted, ping main once to flush any queued tabs.
//   React.useEffect(() => {
//     window.api.pingHeaders?.()
//   }, [])

//   const active = tabs.find(t => t.id === activeId) || tabs[0]

//   // Ensure we always have an active tab when tabs appear
//   React.useEffect(() => {
//     if (!activeId && tabs[0]) setActiveId(tabs[0].id)
//   }, [tabs, activeId, setActiveId])

//   // Auto-select and (if needed) load the first instance when a tab becomes active
//   React.useEffect(() => {
//     if (!active) return
//     if (active.instances?.length && active.activeIdx == null) {
//       const firstIdx = 0
//       const first = active.instances[firstIdx]
//       if (!first) return
//       if (active.cache[firstIdx]) {
//         setTabs(prev => prev.map(t => t.id === active.id ? { ...t, activeIdx: firstIdx, error: undefined } : t))
//       } else {
//         loadInstance(active.id, firstIdx, first.path)
//       }
//     }
//   }, [active?.id, active?.instances?.length])

//   function selectInstance(idx: number) {
//     if (!active) return
//     const inst = active.instances[idx]
//     if (!inst) return

//     if (active.cache[idx]) {
//       // already cached — just switch
//       const id = active.id
//       setTabs(prev => prev.map(t => t.id === id ? { ...t, activeIdx: idx, error: undefined } : t))
//     } else {
//       // lazy load
//       loadInstance(active.id, idx, inst.path)
//     }
//   }

//   // Light helpers to present raw DICOM date/time (no heavy parsing here)
//   const fmtDate = (d?: string | null) => (d && d.length >= 8 ? `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}` : (d ?? '—'))
//   const fmtTime = (t?: string | null) => {
//     if (!t) return '—'
//     // HHMMSS.frac -> HH:MM:SS(.frac)
//     const hh = t.slice(0,2) || ''
//     const mm = t.slice(2,4) || ''
//     const ss = t.slice(4,6) || ''
//     const frac = t.length > 6 ? t.slice(6) : ''
//     const core = [hh, mm, ss].filter(Boolean).join(':')
//     return core + frac
//   }

//   const nodes: HeaderNode[] | undefined =
//     active && active.cache[active.activeIdx] ? active.cache[active.activeIdx] : undefined

//   const mono: React.CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }
//   const th = { padding: '6px 8px', color: '#a7b0be' }
//   const cellMono: React.CSSProperties = { ...mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }


//   return (
//     <div
//       style={{
//         fontFamily: 'ui-sans-serif, system-ui',
//         color: '#e6edf3',
//         background: '#0b0f14',
//         height: '100vh',
//         display: 'grid',
//         gridTemplateRows: 'auto auto 1fr',
//         overflow: 'hidden',
//         // flexDirection: 'column',
//         minHeight: '0',
//       }}
//     >
//       <TitleBar />

//       {/* Tabs bar */}
//       <div
//         style={{
//           display: 'flex',
//           gap: 6,
//           padding: 8,
//           borderBottom: '1px solid #1f2630',
//           position: 'sticky',
//           top: 36, // below title bar
//           background: '#0b0f14',
//           zIndex: 5,
//           flexShrink: 0,
//         }}
//       >
//         {tabs.map((t) => (
//           <div
//             key={t.id}
//             style={{
//               display: 'flex',
//               alignItems: 'center',
//               gap: 8,
//               padding: '6px 10px',
//               borderRadius: 8,
//               border: '1px solid #1f2630',
//               background: t.id === active?.id ? '#121822' : '#0e1420',
//               cursor: 'pointer',
//             }}
//             onClick={() => setActiveId(t.id)}
//             title={t.title}
//           >
//             <span
//               style={{
//                 maxWidth: 260,
//                 overflow: 'hidden',
//                 textOverflow: 'ellipsis',
//                 whiteSpace: 'nowrap',
//               }}
//             >
//               {t.title}
//             </span>
//             <button
//               onClick={(e) => {
//                 e.stopPropagation()
//                 closeTab(t.id)
//               }}
//               style={{
//                 width: 18,
//                 height: 18,
//                 borderRadius: 4,
//                 border: '1px solid #1f2630',
//                 background: '#0b0f14',
//                 color: '#e6edf3',
//                 cursor: 'pointer',
//                 lineHeight: '14px',
//               }}
//             >
//               ×
//             </button>
//           </div>
//         ))}
//         <div style={{ marginLeft: 'auto', color: '#a7b0be', fontSize: 12 }}>
//           {tabs.length ? `${tabs.length} tab${tabs.length > 1 ? 's' : ''}` : 'Open a header from the main window'}
//         </div>
//       </div>

//       {/* Instance list + header viewer */}
//       {active ? (
//         <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>
//           {/* Compact instance list */}
//           <div style={{ border: '1px solid #1f2630', borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
//             <div
//               style={{
//                 display: 'grid',
//                 gridTemplateColumns: '56px 1fr 120px 120px 120px 2fr',
//                 padding: '6px 8px',
//                 borderBottom: '1px solid #1f2630',
//               }}
//             >
//               <div style={th}>#</div>
//               <div style={th}>SOPInstanceUID</div>
//               <div style={th}>Instance Number</div>
//               <div style={th}>Date</div>
//               <div style={th}>Time</div>
//               <div style={th}>Path</div>
//             </div>
//             <div style={{ maxHeight: 160, overflow: 'auto' }}>
//               {active.instances.map((inst: any, i: number) => {
//                 const selected = i === active.activeIdx
//                 return (
//                   <div
//                     key={i}
//                     onClick={() => selectInstance(i)}
//                     title={inst.path}
//                     style={{
//                       display: 'grid',
//                       gridTemplateColumns: '56px 1fr 120px 120px 120px 2fr',
//                       padding: '6px 8px',
//                       borderBottom: '1px solid #1f2630',
//                       background: selected ? '#121822' : 'transparent',
//                       cursor: 'pointer',
//                     }}
//                   >
//                     <div>{i + 1}</div>
//                     <div style={cellMono}>{inst.sop || '—'}</div>
//                     <div style={cellMono}>{inst.instanceNumber ?? '—'}</div>
//                     <div style={cellMono}>{fmtDate(inst.date)}</div>
//                     <div style={cellMono}>{fmtTime(inst.time)}</div>
//                     <div style={cellMono}>{inst.path}</div>
//                   </div>
//                 )
//               })}
//               {active.instances.length === 0 && (
//                 <div style={{ padding: '8px 10px', color: '#a7b0be' }}>No instances in this series.</div>
//               )}
//             </div>
//           </div>

//           {/* Header panel */}
//           <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
//           {active.loading && !nodes && <div>Loading headers…</div>}
//           {active.error && <div style={{ color: '#ef4444' }}>Error: {active.error}</div>}
//           {nodes && (
//             <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
//             <HeaderTree nodes={nodes} initialOpen={false} fillHeight />
//             </div>
//           )}
//           {!active.loading && !nodes && !active.error && (
//             <div style={{ opacity: 0.7 }}>Select an instance above to view headers.</div>
//           )}
//         </div>
//       </div>
//       ) : (
//         <div style={{ padding: 12, opacity: 0.7, flex: 1, minHeight: 0}}>No tabs open.</div>
//       )}
//     </div>
//   )
// }