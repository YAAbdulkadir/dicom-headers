// electron/preload.ts
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

/* ----------------------------- Shared types ----------------------------- */
export type InstanceRef = {
  path: string
  sop?: string
  instanceNumber?: number
  date?: string
  time?: string
}

export type SeriesOpenPayload = {
  seriesKey: string
  title: string
  instances: InstanceRef[]
  tabKey?: string
  activate?: boolean
}

export type ScanOptions = {
  ignorePrivate: boolean
  ignoreBulk: boolean
  redactPHI: boolean
}

export type ScanProgressMessage = {
  type: 'progress'
  jobId: string
  processed?: number
  total?: number
  percent?: number
}

export type ScanResultMessage = {
  type: 'result'
  jobId: string
  index: unknown
}

export type ScanErrorMessage = {
  type: 'error'
  jobId: string
  error: string
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

export type HeadersGetOptions = ScanOptions

export type ChosenPath =
  | { path: string; kind: 'file' }
  | { path: string; kind: 'directory' }

/* ------------------------------ API contract ---------------------------- */
export interface RendererApi {
  // Window
  winMinimize: () => Promise<void>
  winMaximize: () => Promise<void>
  winClose: () => Promise<void>
  winFullScreenToggle?: () => Promise<void>

  // Dialogs (explicit)
  chooseFile: () => Promise<ChosenPath | null>
  chooseDir: () => Promise<ChosenPath | null>

  // Scanning
  startScan: (root: string, options: ScanOptions) => Promise<string>
  onScanProgress: (cb: (msg: ScanProgressMessage) => void) => () => void
  onScanResult: (cb: (msg: ScanResultMessage) => void) => () => void
  onScanError: (cb: (msg: ScanErrorMessage) => void) => () => void

  // Headers
  getHeaders: (path: string, options: HeadersGetOptions) => Promise<HeaderNode[]>

  // Headers window & tabs
  openHeaderSeries: (payload: SeriesOpenPayload) => Promise<boolean>
  onHeadersAddTab: (cb: (payload: SeriesOpenPayload) => void) => () => void
  openSingleFile: (filePath: string) => Promise<boolean>

  copyText: (text: string) => Promise<boolean>
  pingHeaders?: () => Promise<void>
}

const headersEventBuffer: any[] = []
let headersListener: ((p: any)=>void) | null = null

ipcRenderer.on('headers:add-tab', (_e, payload) => {
  if (headersListener) headersListener(payload)
  else headersEventBuffer.push(payload)
})

/* ----------------------------- Implementation --------------------------- */
const api = {
  // Window controls
  winMinimize: () => ipcRenderer.invoke('win:minimize'),
  winMaximize: () => ipcRenderer.invoke('win:maximize'),
  winClose: () => ipcRenderer.invoke('win:close'),
  winFullScreenToggle: () => ipcRenderer.invoke('win:fullscreenToggle'),

  // Dialogs (explicit)
  chooseFile: () => ipcRenderer.invoke('dialog:chooseFile') as Promise<ChosenPath | null>,
  chooseDir: () => ipcRenderer.invoke('dialog:chooseDir') as Promise<ChosenPath | null>,

  // Scanning
  startScan: (root: string, options: ScanOptions) =>
    ipcRenderer.invoke('scan:start', root, options),

  onScanProgress: (cb: (msg: ScanProgressMessage) => void) => {
    const h = (_e: IpcRendererEvent, msg: ScanProgressMessage) => cb(msg)
    ipcRenderer.on('scan:progress', h)
    return () => ipcRenderer.off('scan:progress', h)
  },

  onScanResult: (cb: (msg: ScanResultMessage) => void) => {
    const h = (_e: IpcRendererEvent, msg: ScanResultMessage) => cb(msg)
    ipcRenderer.on('scan:result', h)
    return () => ipcRenderer.off('scan:result', h)
  },

  onScanError: (cb: (msg: ScanErrorMessage) => void) => {
    const h = (_e: IpcRendererEvent, msg: ScanErrorMessage) => cb(msg)
    ipcRenderer.on('scan:error', h)
    return () => ipcRenderer.off('scan:error', h)
  },

  // Headers
  getHeaders: (path: string, options: HeadersGetOptions) =>
    ipcRenderer.invoke('headers:get', path, options),

  openHeaderSeries: (payload: SeriesOpenPayload) =>
    ipcRenderer.invoke('headers:openSeries', payload),

  onHeadersAddTab: (cb: (payload: SeriesOpenPayload) => void) => {
    headersListener = cb
    // flush buffered events
    while (headersEventBuffer.length) cb(headersEventBuffer.shift())
      return () => { headersListener = null }
  },

  openSingleFile: (filePath: string) => ipcRenderer.invoke('headers:openSingleFile', filePath),
  //   const h = (_e: IpcRendererEvent, payload: SeriesOpenPayload) => cb(payload)
  //   ipcRenderer.on('headers:add-tab', h)
  //   return () => ipcRenderer.off('headers:add-tab', h)
  // },

  pingHeaders: () => ipcRenderer.invoke('headers:ping'),

  copyText: async (text: string) => {
    try {
      // Prefer Electron main-process clipboard (works everywhere)
      await ipcRenderer.invoke('util:copyText', String(text ?? ''))
      return true
    } catch {
      // Fallback: try navigator.clipboard for good measure
      try {
        await navigator.clipboard.writeText(String(text ?? ''))
        return true
      } catch {
        return false
      }
    }
  },
} as const

contextBridge.exposeInMainWorld('api', api)

// Optional: make TS happy in renderer
declare global {
  interface Window {
    api: typeof api
  }
}
