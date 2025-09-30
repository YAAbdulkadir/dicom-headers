import React from 'react'
import { HeaderNode, HeaderTree, } from './components/Headers'

declare global {
  interface Window {
    api: {
      winMinimize: () => Promise<void>
      winMaximize: () => Promise<void>
      winClose: () => Promise<void>
      chooseDir: () => Promise<string | null>
      startScan: (root: string, options: any) => Promise<string>
      onScanProgress: (cb: (msg: any) => void) => void
      onScanResult: (cb: (msg: any) => void) => void
      onScanError: (cb: (msg: any) => void) => void
      getHeaders: (path: string, options: any) => Promise<any>
    }
  }
}


const mono: React.CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }
function btn() {
  return {
    padding: '8px 12px', borderRadius: 8, border: '1px solid #1f2630',
    background: '#0e1420', color: '#e6edf3', cursor: 'pointer'
  } as React.CSSProperties
}
function Card(p: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...p} style={{
      border: '1px solid #1f2630', borderRadius: 12, padding: 12,
      ...(p.style || {})
    }} />
  )
}

export default function App() {
  const [root, setRoot] = React.useState('')
  const [jobId, setJobId] = React.useState<string | null>(null)
  const [progress, setProgress] = React.useState(0)
  const [index, setIndex] = React.useState<any | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    window.api.onScanProgress((msg) => {
      if (msg.jobId === jobId) setProgress(Math.floor((msg.percent || 0) * 100))
    })
    window.api.onScanResult((msg) => {
      if (msg.jobId === jobId) {
        setProgress(100)
        setIndex(msg.index)
      }
    })
    window.api.onScanError((msg) => setError(msg.error || 'Unknown error'))
  }, [jobId])

  async function pick() {
    const p = await window.api.chooseDir()
    if (p) setRoot(p)
  }
  async function start() {
    setIndex(null); setError(null); setProgress(0)
    const id = await window.api.startScan(root, { ignorePrivate: true, ignoreBulk: true, redactPHI: true })
    setJobId(id)
  }

  const hasSummary = Boolean(index?.stats)

  return (
    <div style={{ fontFamily: 'ui-sans-serif, system-ui', color: '#e6edf3', background: '#0b0f14', minHeight: '100vh' }}>
      <TitleBar />

      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            value={root}
            onChange={(e) => setRoot(e.target.value)}
            placeholder="Select a folder…"
            style={{
              flex: 1, padding: 8, borderRadius: 8, border: '1px solid #1f2630',
              background: '#0e1420', color: '#e6edf3', outline: 'none'
            }}
          />
          <button onClick={pick} style={btn()}>Browse</button>
          <button onClick={start} style={btn()}>Scan</button>
        </div>

        {/* Progress */}
        {jobId && progress < 100 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ marginBottom: 6, opacity: .8 }}>Scanning DICOM headers… {progress}%</div>
            <div style={{ height: 8, background: '#121822', border: '1px solid #1f2630', borderRadius: 999 }}>
              <div style={{
                width: `${progress}%`, height: '100%', background: '#3b82f6',
                borderRadius: 999, transition: 'width .15s linear'
              }} />
            </div>
          </div>
        )}

        {/* Summary (when ready) */}
        {hasSummary && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <Badge label="Patients" value={index.stats.patients} />
            <Badge label="Studies" value={index.stats.studies} />
            <Badge label="Series" value={index.stats.series} />
            <Badge label="Instances" value={index.stats.instances} />
            <div style={{ flexBasis: '100%' }} />
            <div style={{ color: '#a7b0be' }}>Modalities:</div>
            {Object.entries(index.stats.modalityBySeries as Record<string, number>)
              .sort((a:any,b:any)=> b[1]-a[1])
              .map(([mod, n]: any) => (
                <Badge key={mod} label={mod} value={n} />
              ))}
          </div>
        )}

        {error && <div style={{ marginTop: 12, color: '#ef4444' }}>Error: {error}</div>}

        {/* Empty state */}
        {index && (!index.patients || index.patients.length === 0) && (
          <div style={{ marginTop: 16, opacity: .8 }}>No DICOM studies detected in this folder.</div>
        )}

        {/* Patients list */}
        {index && (index.patients?.length > 0) && <PatientList data={index} />}
      </div>
    </div>
  )
}

function Badge({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{
      padding: '4px 10px',
      border: '1px solid #1f2630',
      background: '#121822',
      color: '#e6edf3',
      borderRadius: 999,
      display: 'inline-flex',
      gap: 6,
      alignItems: 'center'
    }}>
      <span style={{ color: '#a7b0be' }}>{label}:</span>
      <b>{String(value)}</b>
    </div>
  )
}

function TitleBar() {
  return (
    <div
      style={{
        height: 36, WebkitAppRegion: 'drag' as any, display: 'flex',
        alignItems: 'center', justifyContent: 'space-between', padding: '0 8px',
        background: '#0b0f14', borderBottom: '1px solid #1f2630', position: 'sticky', top: 0, zIndex: 10
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

/* ---------------- Patients → Studies → Series table (unchanged except header text) ---------------- */

function PatientList({ data }: { data: any }) {
  const [openPatient, setOpenPatient] = React.useState<string | null>(null)
  const [openStudy, setOpenStudy] = React.useState<string | null>(null)
  const [modal, setModal] = React.useState<{ path: string, headers: any[] } | null>(null)
  const [loadingHdr, setLoadingHdr] = React.useState(false)

  async function openHeaders(path: string) {
    setLoadingHdr(true)
    const headers = await window.api.getHeaders(path, { ignorePrivate: true, ignoreBulk: true, redactPHI: true })
    setLoadingHdr(false)
    setModal({ path, headers })
  }

  return (
    <div style={{ marginTop: 16 }}>
      <h3>Patients</h3>

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
                              <tr style={{ color: '#a7b0be', textAlign: 'left' }}>
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
                                <tr key={i} style={{ borderTop: '1px solid #1f2630' }}>
                                  <td style={td()}><span style={mono}>{pname}</span></td>
                                  <td style={td()}><span style={mono}>{pid}</span></td>
                                  <td style={td()}>{ser.modality || '-'}</td>
                                  <td style={td()}>{ser.count ?? '-'}</td>
                                  <td style={td()}>{ser.seriesDescription || '-'}</td>
                                  <td style={td()}>{s.studyDescription || '-'}</td>
                                  <td style={td()}>
                                    {ser.instances?.[0]?.path ? (
 
                                    <button
                                      onClick={() =>
                                        window.api.openHeaderSeries({
                                          seriesKey: ser.seriesUID || ser.SeriesInstanceUID || `${s.studyUID}:${ser.seriesNumber ?? i}`,
                                          title: ser.seriesDescription || `${ser.modality || 'Series'}`,
                                          instances: (ser.instances || []).map((inst: any) => ({
                                            path: inst.path,
                                            sop: inst.sop || inst.sopInstanceUID || inst.SOPInstanceUID || '',
                                            instanceNumber: inst.instanceNumber ?? inst.InstanceNumber ?? null,
                                            date: inst.date ?? inst.AcquisitionDate ?? inst.InstanceCreationDate ?? null,
                                            time: inst.time ?? inst.AcquisitionTime ?? inst.InstanceCreationTime ?? null,
                                          })),
                                        })
                                     }
                                     style={btn()}
                                     >
                                      View headers
                                     </button>                                 
                                    ) : <span style={{ opacity: .6 }}>—</span>}
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

            {modal && (
              <Modal onClose={() => setModal(null)} title="DICOM Headers">
                <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>File: {modal.path}</div>
                {loadingHdr ? (
                <div>Loading…</div>
                ) : (
                <HeaderTree nodes={modal.headers as HeaderNode[]} />
                )}
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
      <div style={{ width: 'min(900px, 96vw)', background: '#0b0f14', border: '1px solid #1f2630', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderBottom: '1px solid #1f2630' }}>
          <div style={{ fontWeight: 600 }}>{title}</div>
          <button onClick={onClose} style={{ ...btn(), padding: '4px 8px' }}>Close</button>
        </div>
        <div style={{ padding: 12 }}>
          {children}
        </div>
      </div>
    </div>
  )
}



