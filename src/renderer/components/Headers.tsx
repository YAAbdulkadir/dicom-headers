import React from 'react'


// VR classes
const NUMERIC_VRS = /^(US|SS|UL|SL|FL|FD|IS|DS)$/i;
const TEXT_VRS    = /^(AE|AS|CS|DA|DT|LO|LT|PN|SH|ST|TM|UI|UC|UR|UT)$/i;
const BINARY_VRS  = /^(OB|OW|OF|OD|OL|UN)$/i;
const SEQ_VR      = /^SQ$/i;


function isNumericVR(vr?: string | null) { return !!vr && NUMERIC_VRS.test(vr); }
function isTextVR(vr?: string | null)    { return !!vr && TEXT_VRS.test(vr); }
function isBinaryVR(vr?: string | null)  { return !!vr && BINARY_VRS.test(vr); }


function stripCtl(s: string) { return s.replace(/[\x00-\x1F\x7F]/g, ''); }


// Split ONLY on backslash, never spaces/commas
function splitBackslash(raw: string): string[] {
  const s = stripCtl(String(raw ?? ''));
  return s.includes('\\') ? s.split('\\').map(t => t.trim()) : [s.trim()];
}


// numeric tokenizer (per part)
const NUM_RE = /[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/;

// Infer VM if node.vm is missing/0
function inferVM(vr: string, raw: string, byteLength?: number | null): number {
  const s = String(raw ?? '');
  if (SEQ_VR.test(vr)) return 0;                  // items are handled elsewhere
  if (isBinaryVR(vr)) return 1;

  // Fixed-length numeric VRs: compute from byte length if we have it
  if (/^(US|SS)$/i.test(vr) && byteLength && byteLength % 2 === 0) return Math.max(1, byteLength / 2);
  if (/^(UL|SL|FL)$/i.test(vr) && byteLength && byteLength % 4 === 0) return Math.max(1, byteLength / 4);
  if (/^(FD)$/i.test(vr)       && byteLength && byteLength % 8 === 0) return Math.max(1, byteLength / 8);

  // String VRs (IS/DS/CS/LO/SH/PN/UI/etc): count backslashes
  return s.includes('\\') ? s.split('\\').length : 1;
}

// Parse a multi-value list according to VR
function parseValuesByVR(vr: string, raw: string, vm: number): (number | string)[] {
  const parts = splitBackslash(raw);
  // Respect VM if it’s smaller than the number of backslashes we found
  const use = parts.slice(0, vm > 0 ? vm : parts.length);

  if (isNumericVR(vr)) {
    // IS/DS may be decimal strings; US/SS/… usually numeric already
    return use.map(p => (NUM_RE.test(p) ? Number(p) : stripCtl(p)));
  }

  if (isBinaryVR(vr)) return [];          // we’ll render “[binary]”
  // Text VRs: return as strings (don’t split on spaces)
  return use.map(p => stripCtl(p));
}

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

export const treeRow = {
  padding: '6px 8px',
  borderBottom: '1px solid #1f2630'
} as React.CSSProperties

export function isPrivateTag(tagHex: string): boolean {
  const m = /\(([0-9a-fA-F]{4}),([0-9a-fA-F]{4})\)/.exec(tagHex)
  if (!m) return false
  const group = parseInt(m[1], 16)
  return (group % 2) === 1
}

// Characters 0x00–0x1F and 0x7F are control chars (NUL, etc.)
function stripControlChars(s: string): string {
  return s.replace(/[\x00-\x1F\x7F]/g, '');
}

// Split multi-values on '\' and also try commas/spaces if needed
function tokenizeValues(raw: string): string[] {
  const cleaned = stripControlChars(raw).trim();
  if (!cleaned) return [];
  if (cleaned.includes('\\')) return cleaned.split('\\').map(t => t.trim()).filter(Boolean);
  // fallback: try comma or whitespace separated
  if (cleaned.includes(',')) return cleaned.split(',').map(t => t.trim()).filter(Boolean);
  return cleaned.split(/\s+/).map(t => t.trim()).filter(Boolean);
}

// Extract numeric tokens (handles ints, floats, scientific)
// const NUM_RE = /[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?/g;
function parseNumericTokens(raw: string): (number | string)[] {
  const cleaned = stripControlChars(raw);
  const matches = cleaned.match(NUM_RE);
  if (!matches) return [];
  return matches.map(m => Number(m));
}

// function isNumericVR(vr?: string | null): boolean {
//   return !!vr && /^(US|SS|UL|SL|FL|FD|IS|DS)$/i.test(vr);
// }

// Pretty render: if many tokens, use the array preview; else a single value
function renderTokens(tokens: (number | string)[]) {
  if (tokens.length > 1) return <ArrayPreview values={tokens.map(String)} />;
  if (tokens.length === 1) return String(tokens[0]);
  return '—';
}

function splitMultiValues(raw: string): string[] {
  if (!raw || !raw.includes('\\')) return [];
  return raw.split('\\').map(s => s.trim()).filter(Boolean);
}

function formatValToken(s: string): string | number {
  // avoid converting hex-like or UID-like tokens unintentionally
  const numLike = /^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/;
  return numLike.test(s) ? Number(s) : s;
}

function ArrayPreview({
  values,
  limit = 12,
}: {
  values: string[],
  limit?: number
}) {
  const [expanded, setExpanded] = React.useState(false);
  const shown = expanded ? values : values.slice(0, limit);
  const hidden = values.length - shown.length;

  return (
    <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>
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
            onClick={() => setExpanded(true)}
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
      {' '}
      ]
    </span>
  );
}

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
    setOpenVersion((v) => v + 1)
  }
  function collapseAll() {
    setDefaultOpen(false)
    setOpenVersion((v) => v + 1)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: fillHeight ? '100%' : 'auto', minHeight: 0, minWidth: 0 }}>
      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, minWidth: 0}}>
        <input
          placeholder="Filter (keyword, tag, VR, value)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            flex: 1, padding: 8, borderRadius: 8, border: '1px solid #1f2630',
            background: '#0e1420', color: '#e6edf3', outline: 'none',
            minWidth: 0,
          }}
        />
        <button onClick={expandAll} style={{
          padding: '8px 12px', borderRadius: 8, border: '1px solid #1f2630',
          background: '#0e1420', color: '#e6edf3', cursor: 'pointer'
        }}>Expand all</button>
        <button onClick={collapseAll} style={{
          padding: '8px 12px', borderRadius: 8, border: '1px solid #1f2630',
          background: '#0e1420', color: '#e6edf3', cursor: 'pointer'
        }}>Collapse all</button>
      </div>

      {/* Scroll container (only this scrolls) */}
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
        <div style={{ display: 'block', minWidth: '100%'}}>
        <table
          style={{
            borderCollapse: 'collapse',
            width: 'max-content',          // table grows to content (enables horizontal scroll)
            minWidth: '100%',               // but at least fill the viewport width
            tableLayout: 'auto',
            fontSize: '14px',
            maxWidth: 'none',

          }}
        >
        
          {/* Define columns similar to your former grid template */}
          <colgroup>
            <col style={{ width: 220 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 120 }} />
            <col />                         {/* Value column can expand */}
          </colgroup>

          <thead>
            <tr>
              <th style={thCell}>Keyword</th>
              <th style={thCell}>Tag</th>
              <th style={thCell}>VR</th>
              <th style={thCell}>VM</th>
              <th style={thCell}>Type</th>
              <th style={thCell}>Length</th>
              <th style={thCell}>Value</th>
            </tr>
          </thead>

          <tbody>
            <NodeTableRows
              nodes={filtered}
              depth={0}
              defaultOpen={defaultOpen}
              openVersion={openVersion}
            />
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}

const thCell: React.CSSProperties = {
  textAlign: 'left',
  padding: '6px 8px',
  borderBottom: '1px solid #1f2630',
  position: 'sticky' as any,
  top: 0,
  zIndex: 1,
  background: '#121822',
  color: '#a7b0be',
  boxShadow: '0 1px 0 0 #1f2630 inset',
}

export function NodeTableRows({
  nodes, depth, defaultOpen, openVersion
}: { nodes: HeaderNode[], depth: number, defaultOpen: boolean, openVersion: number }) {
  return (
    <>
      {nodes.map((n, i) => (
        <NodeTableRow key={`${n.tagHex}-${i}`} node={n} depth={depth} defaultOpen={defaultOpen} openVersion={openVersion} />
      ))}
    </>
  )
}

export function NodeTableRow({
  node,
  depth,
  defaultOpen,
  openVersion,
}: {
  node: HeaderNode
  depth: number
  defaultOpen: boolean
  openVersion: number
}) {
  const [open, setOpen] = React.useState(defaultOpen)
  React.useEffect(() => { setOpen(defaultOpen) }, [defaultOpen, openVersion])

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
      : 'Unknown Tag';

  return (
    <>
      <tr>
        {/* Keyword + toggle */}
        <td style={tdCell}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, paddingLeft: 8 + depth * 16 }}>
            <span style={{ width: 18, height: 18, display: 'inline-flex'}}>
            {isSeq ? (
              <button
                onClick={() => setOpen(v => !v)}
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
        </td>

        {/* Tag */}
        <td style={{ ...tdCell, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>
          {isItemRow ? '' : node.tagHex}
        </td>

        {/* VR */}
        <td style={tdCell}>{isItemRow ? '' : (node.vr || '—')}</td>

        {/* VM */}
        <td style={tdCell}>{isItemRow ? '' : (node.vm ?? '—')}</td>

        {/* Type */}
        <td style={tdCell}>{isItemRow ? '' : (node.dtype || '—')}</td>

        {/* Length */}
        <td style={tdCell}>{isItemRow ? '' : (node.length ?? '—')}</td>

        {/* Value / Preview — no wrap; this can extend and drive horizontal scroll */}
        <td style={{ ...tdCell, whiteSpace: 'nowrap' }}>
          {isItemRow ? '' : (() => {
            const vr = node.vr ?? '';
            const raw = node.preview ?? '';
            const length = node.length ?? null;

            if (SEQ_VR.test(vr)) {
              return `Items: ${node.children?.length ?? 0}`;
            }

            if (isBinaryVR(vr)) {
              return <span>[binary]</span>;
            }

            // Decide VM
            const vm = (typeof node.vm === 'number' && node.vm > 0)
             ? node.vm
             : inferVM(vr, raw, length);

            const vals = parseValuesByVR(vr, raw, vm);

            if (vm > 1 || vals.length > 1) {
              return <ArrayPreview values={vals.map(String)} />;
            }

            // Single
            if (vals.length === 1) return String(vals[0]) || '—';
            
            // Fallback: cleaned string
            const cleaned = stripCtl(String(raw));
            return cleaned || '—';
          })()}
          </td>
      </tr>

      {/* Children (only when open) */}
      {isSeq && open && node.children && node.children.length > 0 && (
        <NodeTableRows
          nodes={node.children}
          depth={depth + 1}
          defaultOpen={defaultOpen}
          openVersion={openVersion}
        />
      )}
    </>
  )
}

const tdCell: React.CSSProperties = {
  padding: '6px 8px',
  borderBottom: '1px solid #1f2630',
  verticalAlign: 'top',
}

