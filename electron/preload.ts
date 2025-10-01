
// electron/preload.ts
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

/* ----------------------------- Shared types ----------------------------- */
export type SeriesOpenPayload = {
  seriesKey: string
  title: string
  instances: { path: string; sop?: string; instanceNumber?: number; date?: string; time?: string }[]
}

export type InstanceRef = { path: string; sop?: string; instanceNumber?: number; date?: string; time?: string };
export type OpenHeadersPayload =
  | string                                  // backward compatible (single file path)
  | { instances: InstanceRef[]; title?: string };
export type AddTabPayload =
  | { filePath: string }
  | { instances: InstanceRef[]; title?: string }

export type ScanOptions = {
  ignorePrivate: boolean
  ignoreBulk: boolean
  redactPHI: boolean
}

export type ScanProgressMessage = {
  type: 'progress'
  jobId: string
  processed: number
  total: number
}

export type ScanResultMessage = {
  type: 'result'
  jobId: string
  index: unknown // your final aggregated index type if you have one
}

export type ScanErrorMessage = {
  type: 'error'
  jobId: string
  error: string
}

/** Header node shape coming from the worker (match your worker’s HeaderNode) */
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

/** Options for headers:get (you can reuse ScanOptions) */
export type HeadersGetOptions = ScanOptions

/** Payload sent to the headers window to add a new tab */
export type HeadersAddTabPayload = {
  filePath: string
}

/* ------------------------------ API contract ---------------------------- */
export interface RendererApi {
  // Window controls
  winMinimize: () => Promise<void>
  winMaximize: () => Promise<void>
  winClose: () => Promise<void>
  winFullScreenToggle?: () => Promise<void> // if you exposed it in main

  // Dialogs
  chooseDir: () => Promise<string | null>

  // Scanning
  startScan: (root: string, options: ScanOptions) => Promise<string> // returns jobId
  onScanProgress: (cb: (msg: ScanProgressMessage) => void) => void
  onScanResult: (cb: (msg: ScanResultMessage) => void) => void
  onScanError: (cb: (msg: ScanErrorMessage) => void) => void

  // Headers (single file)
  getHeaders: (path: string, options: HeadersGetOptions) => Promise<HeaderNode[]>

  // Headers window & tabs
  openHeaderWindow: (payload: OpenHeadersPayload) => Promise<boolean>;
  openHeaderSeries: (payload: SeriesOpenPayload) => Promise<boolean>
  onHeadersAddTab: (cb: (payload: { instances: InstanceRef[]; title?: string }) => void) => void;
}

/* ----------------------------- Implementation --------------------------- */
const api = {
  // Window controls
  winMinimize: () => ipcRenderer.invoke('win:minimize'),
  winMaximize: () => ipcRenderer.invoke('win:maximize'),
  winClose: () => ipcRenderer.invoke('win:close'),
  winFullScreenToggle: () => ipcRenderer.invoke('win:fullscreenToggle'),

  // Dialogs
  chooseDir: () => ipcRenderer.invoke('dialog:chooseDir'),

  // Scanning
  startScan: (root: string, options: ScanOptions) =>
    ipcRenderer.invoke('scan:start', root, options),

  onScanProgress: (cb: (msg: ScanProgressMessage) => void) => {
    ipcRenderer.on('scan:progress', (_e: IpcRendererEvent, msg: ScanProgressMessage) => cb(msg))
  },

  onScanResult: (cb: (msg: ScanResultMessage) => void) => {
    ipcRenderer.on('scan:result', (_e: IpcRendererEvent, msg: ScanResultMessage) => cb(msg))
  },

  onScanError: (cb: (msg: ScanErrorMessage) => void) => {
    ipcRenderer.on('scan:error', (_e: IpcRendererEvent, msg: ScanErrorMessage) => cb(msg))
  },

  // Headers
  getHeaders: (path: string, options: HeadersGetOptions) =>
    ipcRenderer.invoke('headers:get', path, options),

  // Headers window & tabs
  openHeaderWindow: (payload: string | AddTabPayload) => ipcRenderer.invoke('headers:openWindow', payload),
  openHeaderSeries: (payload: any) => ipcRenderer.invoke('headers:openSeries', payload),
  onHeadersAddTab: (cb: (payload: AddTabPayload) => void) => {
    const handler = (_e: IpcRendererEvent, payload: AddTabPayload) => cb(payload)
    ipcRenderer.on('headers:add-tab', handler)
    return () => ipcRenderer.off('headers:add-tab', handler)
  },

  // small handshake to force a flush if needed
  pingHeaders: () => ipcRenderer.invoke('headers:ping'),
} as const

contextBridge.exposeInMainWorld('api', api)

// Optional: declare Window.api globally for TS in renderer
declare global {
  interface Window {
    api: typeof api //RendererApi
  }
}
