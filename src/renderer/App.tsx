import React from 'react'
import { HeaderNode, HeaderTree } from './components/Headers'
import TitleBar from './components/TitleBar'

declare global {
  interface Window {
    api: {
      // Window
      winMinimize: () => Promise<void>
      winMaximize: () => Promise<void>
      winClose: () => Promise<void>

      // New explicit dialogs (platform-agnostic)
      chooseFile: () => Promise<{ path: string; kind: 'file' } | null>
      chooseDir:  () => Promise<{ path: string; kind: 'directory' } | null>

      // Scan
      startScan: (root: string, options: any) => Promise<string>
      onScanProgress: (cb: (msg: any) => void) => void
      onScanResult: (cb: (msg: any) => void) => void
      onScanError: (cb: (msg: any) => void) => void

      // Headers
      getHeaders: (path: string, options: any) => Promise<any>
      openHeaderSeries: (payload: {
        seriesKey: string
        title: string
        instances: { path: string; sop?: string; instanceNumber?: number; date?: string; time?: string }[]
        activate?: boolean
        tabKey?: string
      }) => Promise<boolean>
      openSingleFile: (filePath: string) => Promise<boolean>
    }
  }
}

const mono: React.CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }
function btn() {
  return {
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--panel)',
    color: 'var(--fg)',
    cursor: 'pointer',
  } as React.CSSProperties
}
function Card(p: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...p}
      style={{
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 12,
        background: 'var(--bg)',
        ...(p.style || {}),
      }}
    />
  )
}

export default function App() {
  const [selection, setSelection] = React.useState<{ path: string; kind: 'file' | 'directory' } | null>(null)
  const [jobId, setJobId] = React.useState<string | null>(null)
  const [progress, setProgress] = React.useState(0)
  const [index, setIndex] = React.useState<any | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    window.api.onScanProgress((msg) => {
      if (msg.jobId === jobId) {
        const pct =
          typeof msg.percent === 'number'
            ? msg.percent
            : msg.total
            ? (msg.processed || 0) / (msg.total || 1)
            : 0
        setProgress(Math.floor(pct * 100))
      }
    })
    window.api.onScanResult((msg) => {
      if (msg.jobId === jobId) {
        setProgress(100)
        setIndex(msg.index)
      }
    })
    window.api.onScanError((msg) => setError(msg.error || 'Unknown error'))
  }, [jobId])

  async function openFileNow() {
    const chosen = await window.api.chooseFile()
    if (!chosen) return
    setSelection(chosen)
    setIndex(null); setError(null); setProgress(0)

    const filePath = chosen.path
    await window.api.openSingleFile(filePath)
  }

  async function openFolderNow() {
    const chosen = await window.api.chooseDir()
    if (!chosen) return
    setSelection(chosen)
    setIndex(null); setError(null); setProgress(0)

    const id = await window.api.startScan(chosen.path, {
      ignorePrivate: true,
      ignoreBulk: true,
      redactPHI: true,
    })
    setJobId(id)
  }

  const hasSummary = Boolean(index?.stats)

  return (
    <div style={{ fontFamily: 'ui-sans-serif, system-ui', color: 'var(--fg)', background: 'var(--bg)', minHeight: '100vh' }}>
      <TitleBar />

      <div style={{ padding: 16 }}>
        {/* Toolbar: two buttons; selection path shown read-only */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            value={selection ? selection.path : ''}
            readOnly
            placeholder="No file or folder selected"
            style={{
              flex: 1,
              padding: 8,
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--panel)',
              color: 'var(--fg)',
              outline: 'none',
            }}
          />
          <button onClick={openFileNow} style={btn()}>Open File…</button>
          <button onClick={openFolderNow} style={btn()}>Open Folder…</button>
        </div>

        {/* Progress */}
        {jobId && progress < 100 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ marginBottom: 6, color: 'var(--muted)' }}>
              Scanning DICOM headers… {progress}%
            </div>
            <div style={{ height: 8, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 999 }}>
              <div
                style={{
                  width: `${progress}%`,
                  height: '100%',
                  background: 'var(--accent)',
                  borderRadius: 999,
                  transition: 'width .15s linear',
                }}
              />
            </div>
          </div>
        )}

        {/* Summary */}
        {hasSummary && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <Badge label="Patients" value={index.stats.patients} />
            <Badge label="Studies" value={index.stats.studies} />
            <Badge label="Series" value={index.stats.series} />
            <Badge label="Instances" value={index.stats.instances} />
            <div style={{ flexBasis: '100%' }} />
            <div style={{ color: 'var(--muted)' }}>Modalities:</div>
            {Object.entries(index.stats.modalityBySeries as Record<string, number>)
              .sort((a: any, b: any) => b[1] - a[1])
              .map(([mod, n]: any) => (
                <Badge key={mod} label={mod} value={n} />
              ))}
          </div>
        )}

        {error && <div style={{ marginTop: 12, color: 'var(--danger)' }}>Error: {error}</div>}

        {/* Empty state */}
        {index && (!index.patients || index.patients.length === 0) && (
          <div style={{ marginTop: 16, color: 'var(--muted)' }}>No DICOM studies detected in this folder.</div>
        )}

        {/* Patients list */}
        {index && index.patients?.length > 0 && <PatientList data={index} />}
      </div>
    </div>
  )
}

function Badge({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '4px 10px',
        border: '1px solid var(--border)',
        background: 'var(--panel)',
        color: 'var(--fg)',
        borderRadius: 999,
        display: 'inline-flex',
        gap: 6,
        alignItems: 'center',
      }}
    >
      <span style={{ color: 'var(--muted)' }}>{label}:</span>
      <b>{String(value)}</b>
    </div>
  )
}

/* ---------------- Patients → Studies → Series table (unchanged) ---------------- */

function PatientList({ data }: { data: any }) {
  const [openPatient, setOpenPatient] = React.useState<string | null>(null)
  const [openStudy, setOpenStudy] = React.useState<string | null>(null)
  const [modal, setModal] = React.useState<{ path: string, headers: any[] } | null>(null)
  const [loadingHdr, setLoadingHdr] = React.useState(false)

  async function openHeaders(path: string) { // kept if you re-enable modal usage
    setLoadingHdr(true)
    const headers = await window.api.getHeaders(path, { ignorePrivate: true, ignoreBulk: true, redactPHI: true })
    setLoadingHdr(false)
    setModal({ path, headers })
  }

  return (
    <div style={{ marginTop: 16 }}>
      <h3 style={{ color: 'var(--fg)' }}>Patients</h3>

      {data.patients.map((p: any) => {
        const pid = p.patient_id
        const pOpen = openPatient === pid
        const pname = p.patient_name || '(no name)'
        return (
          <Card key={pid} style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div><b>PatientName:</b> <span style={mono}>{pname}</span></div>
                <div><b>PatientID:</b> <span style={mono}>{pid}</span></div>
              </div>
              <button onClick={() => setOpenPatient(pOpen ? null : pid)} style={btn()}>
                {pOpen ? 'Hide studies' : 'Show studies'}
              </button>
            </div>

            {pOpen && (
              <div style={{ marginTop: 10 }}>
                {p.studies.map((s: any) => {
                  const sid = `${pid}:${s.studyUID}`
                  const sOpen = openStudy === sid
                  return (
                    <Card key={s.studyUID} style={{ marginTop: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div><b>StudyInstanceUID:</b> <span style={mono}>{s.studyUID}</span></div>
                          <div><b>StudyDescription:</b> {s.studyDescription || '-'}</div>
                        </div>
                        <button onClick={() => setOpenStudy(sOpen ? null : sid)} style={btn()}>
                          {sOpen ? 'Hide series' : 'Show series'}
                        </button>
                      </div>

                      {sOpen && (
                        <div style={{ marginTop: 10, overflow: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ color: 'var(--muted)', textAlign: 'left' }}>
                                <th style={th()}>PatientName</th>
                                <th style={th()}>PatientID</th>
                                <th style={th()}>Modality</th>
                                <th style={th()}>Instances</th>
                                <th style={th()}>SeriesDescription</th>
                                <th style={th()}>StudyDescription</th>
                                <th style={th()}>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {s.series.map((ser: any, i: number) => (
                                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                                  <td style={td()}><span style={mono}>{pname}</span></td>
                                  <td style={td()}><span style={mono}>{pid}</span></td>
                                  <td style={td()}>{(ser.modality || '-')}</td>
                                  <td style={td()}>{(ser.count ?? '-')}</td>
                                  <td style={td()}>{(ser.seriesDescription || '-')}</td>
                                  <td style={td()}>{(s.studyDescription || '-')}</td>
                                  <td style={td()}>
                                    {ser.instances?.[0]?.path ? (
                                      <button
                                        onClick={() =>
                                          window.api.openHeaderSeries({
                                            seriesKey: ser.seriesUID || ser.SeriesInstanceUID || `${s.studyUID}:${ser.seriesNumber ?? i}`,
                                            title: `${ser.modality || 'UNK'} — ${ser.seriesDescription || 'Series'}`,
                                            instances: (ser.instances || []).map((inst: any) => ({
                                              path: inst.path,
                                              sop: inst.sop || inst.sopInstanceUID || inst.SOPInstanceUID || '',
                                              instanceNumber: inst.instanceNumber ?? inst.InstanceNumber ?? null,
                                              date: inst.date ?? inst.AcquisitionDate ?? inst.InstanceCreationDate ?? null,
                                              time: inst.time ?? inst.AcquisitionTime ?? inst.InstanceCreationTime ?? null,
                                            })),
                                            activate: true,
                                          })
                                        }
                                        style={btn()}
                                      >
                                        View headers
                                      </button>
                                    ) : (
                                      <span style={{ opacity: 0.6 }}>—</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </Card>
                  )
                })}
              </div>
            )}

            {/* Optional modal single-file viewer still available */}
            {modal && (
              <Modal onClose={() => setModal(null)} title="DICOM Headers">
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>File: {modal.path}</div>
                {loadingHdr ? <div>Loading…</div> : <HeaderTree nodes={modal.headers as HeaderNode[]} />}
              </Modal>
            )}
          </Card>
        )
      })}
    </div>
  )
}

function th(){ return { padding: '8px' } as React.CSSProperties }
function td(){ return { padding: '8px', verticalAlign: 'top' } as React.CSSProperties }

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: ()=>void }){
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 50
    }}>
      <div style={{
        width: 'min(900px, 96vw)',
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        boxShadow: '0 20px 60px rgba(0,0,0,.35)'
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: 12, borderBottom: '1px solid var(--border)', background: 'var(--panel)'
        }}>
          <div style={{ fontWeight: 600, color: 'var(--fg)' }}>{title}</div>
          <button onClick={onClose} style={{ ...btn(), padding: '4px 8px' }}>Close</button>
        </div>
        <div style={{ padding: 12 }}>
          {children}
        </div>
      </div>
    </div>
  )
}
