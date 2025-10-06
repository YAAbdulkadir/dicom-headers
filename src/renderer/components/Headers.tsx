import React from 'react'

/* ===================== VR helpers ===================== */

const NUMERIC_VRS = /^(US|SS|UL|SL|FL|FD|IS|DS)$/i
const TEXT_VRS    = /^(AE|AS|CS|DA|DT|LO|LT|PN|SH|ST|TM|UI|UC|UR|UT)$/i
const BINARY_VRS  = /^(OB|OW|OF|OD|OL|UN)$/i
const SEQ_VR      = /^SQ$/i

function isNumericVR(vr?: string | null) { return !!vr && NUMERIC_VRS.test(vr) }
function isBinaryVR(vr?: string | null)  { return !!vr && BINARY_VRS.test(vr) }

function stripCtl(s: string) { return s.replace(/[\x00-\x1F\x7F]/g, '') }

// numeric token matcher (single value)
const NUM_RE = /[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/

// Only split on backslashes (DICOM multi-value)
function splitBackslash(raw: string): string[] {
  const s = stripCtl(String(raw ?? ''))
  return s.includes('\\') ? s.split('\\').map(t => t.trim()) : [s.trim()]
}

// Infer VM if node.vm is missing/0
function inferVM(vr: string, raw: string, byteLength?: number | null): number {
  const s = String(raw ?? '')
  if (SEQ_VR.test(vr)) return 0
  if (isBinaryVR(vr)) return 1

  // Fixed-length numeric VRs: compute from byte length if available
  if (/^(US|SS)$/i.test(vr) && byteLength && byteLength % 2 === 0) return Math.max(1, byteLength / 2)
  if (/^(UL|SL|FL)$/i.test(vr) && byteLength && byteLength % 4 === 0) return Math.max(1, byteLength / 4)
  if (/^FD$/i.test(vr)       && byteLength && byteLength % 8 === 0) return Math.max(1, byteLength / 8)

  // Strings (IS/DS/CS/…): count backslashes
  return s.includes('\\') ? s.split('\\').length : 1
}

// Parse a multi-value list according to VR
function parseValuesByVR(vr: string, raw: string, vm: number): (number | string)[] {
  const parts = splitBackslash(raw)
  const use = parts.slice(0, vm > 0 ? vm : parts.length)

  if (isNumericVR(vr)) {
    // Numbers if they look numeric; otherwise keep original token
    return use.map(p => (NUM_RE.test(p) ? Number(p) : stripCtl(p)))
  }
  if (isBinaryVR(vr)) return []
  return use.map(p => stripCtl(p))
}

function formatValToken(s: string): string | number {
  const numLike = /^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/
  return numLike.test(s) ? Number(s) : s
}

/* ===================== Types ===================== */

export type HeaderNode = {
  tagHex: string
  keyword: string
  vr: string | null
  length: number | null
  vm: number | null
  dtype: string | null
  preview: string
  children?: HeaderNode[]
}

/* ===================== Utilities ===================== */

export function isPrivateTag(tagHex: string): boolean {
  const m = /\(([0-9a-fA-F]{4}),([0-9a-fA-F]{4})\)/.exec(tagHex)
  if (!m) return false
  const group = parseInt(m[1], 16)
  return (group % 2) === 1
}

const mono: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
}

/* ===================== Copyable TD ===================== */

function CopyableTd({
  children,
  textToCopy,
  disabled = false,
  style,
}: {
  children: React.ReactNode
  textToCopy?: string
  disabled?: boolean
  style?: React.CSSProperties
}) {
  const [copied, setCopied] = React.useState(false)

  const doCopy = async () => {
    if (disabled || !textToCopy) return
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(textToCopy)
      } else {
        // Fallback
        const ta = document.createElement('textarea')
        ta.value = textToCopy
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.focus()
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 900)
    } catch {
      // ignore
    }
  }

  return (
    <td
      onClick={doCopy}
      title={textToCopy ? (copied ? 'Copied!' : 'Click to copy') : undefined}
      style={{
        ...tdCell,
        ...(textToCopy && !disabled ? { cursor: 'copy' } : {}),
        position: 'relative',
        ...style,
      }}
    >
      {children}
      {copied && (
        <span
          style={{
            position: 'absolute',
            right: 8,
            top: 4,
            fontSize: 11,
            padding: '2px 6px',
            borderRadius: 6,
            border: '1px solid #1f2630',
            background: '#0e1420',
            color: '#a7b0be',
            pointerEvents: 'none',
          }}
        >
          Copied
        </span>
      )}
    </td>
  )
}

/* ===================== Array preview ===================== */

function ArrayPreview({
  values,
  limit = 12,
  onExpandChange,
}: {
  values: string[],
  limit?: number,
  onExpandChange?: (expanded: boolean) => void
}) {
  const [expanded, setExpanded] = React.useState(false)
  const shown = expanded ? values : values.slice(0, limit)
  const hidden = values.length - shown.length

  const expandAll = () => { setExpanded(true); onExpandChange?.(true) }
  const collapse = () => { setExpanded(false); onExpandChange?.(false) }

  return (
    <span style={mono}>
      [
      {' '}
      {shown.map((v, i) => (
        <React.Fragment key={i}>
          <span>{String(formatValToken(v))}</span>
          {i < shown.length - 1 ? ', ' : null}
        </React.Fragment>
      ))}
      {hidden > 0 && !expanded ? (
        <>
          {shown.length ? ', ' : null}
          <button
            onClick={expandAll}
            style={{
              border: '1px solid #1f2630',
              background: '#0e1420',
              color: '#e6edf3',
              borderRadius: 6,
              padding: '0 6px',
              cursor: 'pointer',
            }}
            title="Show all values"
          >
            +{hidden} more
          </button>
        </>
      ) : null}
      {' '}]
      {expanded && values.length > limit && (
        <button
          onClick={collapse}
          style={{
            marginLeft: 6,
            border: '1px solid #1f2630',
            background: '#0e1420',
            color: '#a7b0be',
            borderRadius: 6,
            padding: '0 6px',
            cursor: 'pointer',
          }}
          title="Collapse"
        >
          Show less
        </button>
      )}
    </span>
  )
}

/* ===================== Main tree ===================== */

export function HeaderTree({
  nodes,
  initialOpen = true,
  fillHeight = false,
}: {
  nodes: HeaderNode[]
  initialOpen?: boolean
  fillHeight?: boolean
}) {
  const [query, setQuery] = React.useState('')
  const [defaultOpen, setDefaultOpen] = React.useState(initialOpen)
  const [openVersion, setOpenVersion] = React.useState(0)
  
  const rowIndexRef = React.useRef(0)
  rowIndexRef.current = 0;  // reset on each render

  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')
  const q = norm(query.trim())

  function filterNodes(ns: HeaderNode[]): HeaderNode[] {
    if (!q) return ns
    const out: HeaderNode[] = []
    for (const n of ns) {
      const text = `${n.keyword} ${n.tagHex} ${n.vr ?? ''} ${n.preview}`
      const hit = norm(text).includes(q)
      const kids = filterNodes(n.children || [])
      if (hit || kids.length) out.push({ ...n, children: kids })
    }
    return out
  }
  const filtered = filterNodes(nodes)

  function expandAll() {
    setDefaultOpen(true)
    setOpenVersion(v => v + 1)
  }
  function collapseAll() {
    setDefaultOpen(false)
    setOpenVersion(v => v + 1)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: fillHeight ? '100%' : 'auto', minHeight: 0, minWidth: 0 }}>
      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, minWidth: 0 }}>
        <input
          placeholder="Filter (keyword, tag, VR, value)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            flex: 1, padding: 8, borderRadius: 8, border: '1px solid #1f2630',
            background: '#0e1420', color: '#e6edf3', outline: 'none', minWidth: 0,
          }}
        />
        <button onClick={expandAll} style={btn}>Expand all</button>
        <button onClick={collapseAll} style={btn}>Collapse all</button>
      </div>

      {/* Scroll container */}
      <div
        style={{
          border: '1px solid #1f2630',
          borderRadius: 8,
          overflowX: 'auto',
          overflowY: 'auto',
          width: '100%',
          maxWidth: '100%',
          ...(fillHeight ? { flex: 1, minHeight: 0 } : { maxHeight: 480 }),
          minWidth: 0,
          position: 'relative',
        }}
      >
        <div style={{ display: 'block', minWidth: '100%' }}>
          <table
            style={{
              borderCollapse: 'collapse',
              width: 'max-content',
              minWidth: '100%',
              tableLayout: 'auto',
              fontSize: '14px',
              maxWidth: 'none',
            }}
          >
            <colgroup>
              <col style={{ width: 220 }} />
              <col style={{ width: 140 }} />
              <col style={{ width: 80 }} />
              <col style={{ width: 80 }} />
              {/* <col style={{ width: 140 }} /> */}
              <col style={{ width: 120 }} />
              <col />
            </colgroup>

            <thead>
              <tr>
                <th style={thCell}>Keyword</th>
                <th style={thCell}>Tag</th>
                <th style={thCell}>VR</th>
                <th style={thCell}>VM</th>
                <th style={thCell}>Type</th>
                {/* <th style={thCell}>Length</th> */}
                <th style={thCell}>Value</th>
              </tr>
            </thead>

            <tbody>
              <NodeTableRows
                nodes={filtered}
                depth={0}
                defaultOpen={defaultOpen}
                openVersion={openVersion}
                rowIndexRef={rowIndexRef}
              />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ===================== Rows ===================== */

const thCell: React.CSSProperties = {
  textAlign: 'left',
  padding: '4px 6px',
  borderBottom: '1px solid #1f2630',
  position: 'sticky' as any,
  top: 0,
  zIndex: 1,
  background: '#121822',
  color: '#a7b0be',
  boxShadow: '0 1px 0 0 #1f2630 inset',
  fontSize: 14,
  lineHeight: 1.25,
}

export function NodeTableRows({
  nodes, depth, defaultOpen, openVersion, rowIndexRef
}: { nodes: HeaderNode[], depth: number, defaultOpen: boolean, openVersion: number, rowIndexRef: React.MutableRefObject<number> }) {
  return (
    <>
      {nodes.map((n, i) => (
        <NodeTableRow key={`${n.tagHex}-${i}`} node={n} depth={depth} defaultOpen={defaultOpen} openVersion={openVersion} rowIndexRef={rowIndexRef}/>
      ))}
    </>
  )
}

export function NodeTableRow({
  node,
  depth,
  defaultOpen,
  openVersion,
  rowIndexRef,
}: {
  node: HeaderNode
  depth: number
  defaultOpen: boolean
  openVersion: number
  rowIndexRef: React.MutableRefObject<number>
}) {
  const [open, setOpen] = React.useState(defaultOpen)
  const [valueExpanded, setValueExpanded] = React.useState(false)
  React.useEffect(() => { setOpen(defaultOpen) }, [defaultOpen, openVersion])

  const rowIndex = rowIndexRef.current++;
  const rowBg = (rowIndex % 2 === 1) ? '#0f1622' : 'transparent'; // subtle zebra
  const isSeq =
    (node.children && node.children.length > 0) ||
    node.vr === 'SQ' ||
    node.dtype === 'Sequence' ||
    (node.preview?.startsWith('Items:'))

  const isItemRow = /^Item\s+\d+$/i.test(node.keyword || '')

  const keywordDisplay =
    node.keyword && node.keyword.trim().length > 0
      ? node.keyword
      : isPrivateTag(node.tagHex)
      ? 'Private Tag'
      : 'Unknown Tag'

  const safe = (v: any) => (v == null ? '' : String(v))

  // ---- Build Value cell content + copy text ----
  let valueDisplay: React.ReactNode = null
  let copyValue = ''

  const vr = node.vr ?? ''
  const raw = node.preview ?? ''
  const length = node.length ?? null

  if (isItemRow) {
    valueDisplay = ''
    copyValue = ''
  } else if (SEQ_VR.test(vr)) {
    const n = node.children?.length ?? 0
    valueDisplay = `Items: ${n}`
    copyValue = `Items: ${n}`
  } else if (isBinaryVR(vr)) {
    valueDisplay = <span>[binary]</span>
    copyValue = '[binary]'
  } else {
    const vm = (typeof node.vm === 'number' && node.vm > 0) ? node.vm : inferVM(vr, raw, length)
    const vals = parseValuesByVR(vr, raw, vm)
    if (vm > 1 || vals.length > 1) {
      const all = vals.map(String)
      valueDisplay = (
        <ArrayPreview
          values={all}
          onExpandChange={(exp) => setValueExpanded(exp)}
        />
      )
      copyValue = `[${all.join(', ')}]`
    } else if (vals.length === 1) {
      valueDisplay = String(vals[0]) || ''
      copyValue = String(vals[0]) || ''
    } else {
      const cleaned = stripCtl(String(raw))
      valueDisplay = cleaned || ''
      copyValue = cleaned || ''
    }
  }

  return (
    <>
      <tr style={{ background: rowBg }}>
        {/* Keyword + toggle */}
        <CopyableTd textToCopy={safe(keywordDisplay)}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, paddingLeft: 8 + depth * 16 }}>
            <span style={{ width: 18, height: 18, display: 'inline-flex' }}>
              {isSeq ? (
                <button
                  onClick={(e) => { e.stopPropagation(); setOpen(v => !v) }}
                  title={open ? 'Collapse' : 'Expand'}
                  aria-label={open ? 'Collapse' : 'Expand'}
                  style={{
                    width: 18, height: 18, lineHeight: '14px',
                    borderRadius: 4, border: '1px solid #1f2630',
                    background: '#0e1420', color: '#e6edf3', cursor: 'pointer',
                    userSelect: 'none', textAlign: 'center', padding: 0,
                  }}
                >
                  {open ? '-' : '+'}
                </button>
              ) : null}
            </span>
            <span>{keywordDisplay}</span>
          </div>
        </CopyableTd>

        {/* Tag */}
        <CopyableTd
          textToCopy={isItemRow ? '' : safe(node.tagHex)}
          style={mono}
          disabled={isItemRow}
        >
          {isItemRow ? '' : node.tagHex}
        </CopyableTd>

        {/* VR */}
        <CopyableTd textToCopy={isItemRow ? '' : safe(node.vr)} disabled={isItemRow}>
          {isItemRow ? '' : (node.vr || '')}
        </CopyableTd>

        {/* VM */}
        <CopyableTd textToCopy={isItemRow ? '' : safe(node.vm)} disabled={isItemRow}>
          {isItemRow ? '' : (node.vm ?? '')}
        </CopyableTd>

        {/* Type */}
        <CopyableTd textToCopy={isItemRow ? '' : safe(node.dtype)} disabled={isItemRow}>
          {isItemRow ? '' : (node.dtype || '')}
        </CopyableTd>

        {/* Length */}
        {/* <CopyableTd textToCopy={isItemRow ? '' : safe(node.length)} disabled={isItemRow}>
          {isItemRow ? '' : (node.length ?? '')}
        </CopyableTd> */}

        {/* Value — wraps when expanded */}
        <CopyableTd
          textToCopy={copyValue}
          disabled={isItemRow}
          style={ valueExpanded
            ? { whiteSpace: 'pre-wrap', wordBreak: 'break-word' }
            : { whiteSpace: 'nowrap' }
          }
        >
          {valueDisplay}
        </CopyableTd>
      </tr>

      {/* Children (only when open) */}
      {isSeq && open && node.children && node.children.length > 0 && (
        <NodeTableRows
          nodes={node.children}
          depth={depth + 1}
          defaultOpen={defaultOpen}
          openVersion={openVersion}
          rowIndexRef={rowIndexRef}
        />
      )}
    </>
  )
}

/* ===================== Styling bits ===================== */

const btn: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid #1f2630',
  background: '#0e1420',
  color: '#e6edf3',
  cursor: 'pointer',
}

const tdCell: React.CSSProperties = {
  padding: '3px 6px',
  borderBottom: '1px solid #1f2630',
  verticalAlign: 'top',
  userSelect: 'text',
  fontSize: 14,
  lineHeight: 1.25,
}
