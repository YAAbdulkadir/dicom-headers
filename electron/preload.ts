// electron/preload.ts
import { contextBridge, IpcRenderer, ipcRenderer, IpcRendererEvent } from 'electron'

// Theme types
export type ThemeSource = 'system' | 'light' | 'dark' | `custom:${string}`
export type ThemePayload = {
  themeSource: ThemeSource
  shouldUseDarkColors: boolean
}

// Theme IPC channel name (matches main.ts)
const THEME_CHANNEL = 'theme:changed'

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

/* -------- New: tab context menu & new-window helpers (renderer-facing) ------- */
export type TabMeta = {
  id: string
  title: string
  firstPath?: string
}

export type ScreenPos = { x: number; y: number }
export type TabMenuChoice =
  | 'copyPath'
  | 'splitRight'
  | 'splitLeft'
  | 'openInNewWindow'
  | 'cancel'

export type AppInfo = {
  name: string
  version: string
  author?: string
  homepage?: string
}

/* ------------------------------ API contract ---------------------------- */
export interface RendererApi {
  // Theme
  theme?: {
    get: () => Promise<ThemePayload>
    set: (theme: ThemeSource) => Promise<ThemePayload>
    onDidChange: (cb: (payload: ThemePayload) => void) => () => void
  }
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

  // Tab context menu + new-window
  showTabContextMenu: (args: {
    tab: TabMeta
    screenPos: ScreenPos
    payload?: SeriesOpenPayload
  }) => Promise<TabMenuChoice>

  openSeriesInNewWindow: (payload: SeriesOpenPayload) => Promise<boolean>

  copyText: (text: string) => Promise<boolean>
  pingHeaders?: () => Promise<void>
  helloNewHeadersWindow: () => Promise<boolean>

  getAppInfo: () => Promise<AppInfo>
  getAppIcon: () => Promise<string | null>
  openAbout: () => Promise<boolean>
}

const headersEventBuffer: SeriesOpenPayload[] = []
let headersListener: ((p: SeriesOpenPayload) => void) | null = null

ipcRenderer.on('headers:add-tab', (_e, payload: SeriesOpenPayload) => {
  console.log('[preload] got headers:add-tab', {
    title: payload?.title,
    n: payload?.instances?.length,
    tabKey: payload?.tabKey
  })
  if (headersListener) {
    console.log('[preload] dispatching to listener immediately')
    headersListener(payload)
  }
  else {
    console.log('[preload] buffering (no listener yet)')
    headersEventBuffer.push(payload)
  }
})

/* ----------------------------- Implementation --------------------------- */
const api = {
  // Theme
  theme: {
    get: () => ipcRenderer.invoke('theme:get') as Promise<ThemePayload>,
    set: (theme: ThemeSource) => ipcRenderer.invoke('theme:set', theme) as Promise<ThemePayload>,
    onDidChange: (cb: (payload: ThemePayload) => void) => {
      const listener = (_e: IpcRendererEvent, payload: ThemePayload) => cb(payload)
      ipcRenderer.on(THEME_CHANNEL, listener)
      return () => ipcRenderer.off(THEME_CHANNEL, listener)
    },
  },
  // Window controls
  winMinimize: () => ipcRenderer.invoke('win:minimize'),
  winMaximize: () => ipcRenderer.invoke('win:maximize'),
  winClose: () => ipcRenderer.invoke('win:close'),
  winFullScreenToggle: () => ipcRenderer.invoke('win:fullscreenToggle'),

  // Dialogs (explicit)
  chooseFile: () =>
    ipcRenderer.invoke('dialog:chooseFile') as Promise<ChosenPath | null>,
  chooseDir: () =>
    ipcRenderer.invoke('dialog:chooseDir') as Promise<ChosenPath | null>,

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
    console.log('[preload] onHeadersAddTab: listener registered, flushing', headersEventBuffer.length)
    headersListener = cb
    while (headersEventBuffer.length) cb(headersEventBuffer.shift()!)
    return () => {
      headersListener = null
    }
  },

  openSingleFile: (filePath: string) =>
    ipcRenderer.invoke('headers:openSingleFile', filePath),

  // Handshake
  pingHeaders: () => ipcRenderer.invoke('headers:ping'),

  // Copy helper
  copyText: async (text: string) => {
    try {
      await ipcRenderer.invoke('util:copyText', String(text ?? ''))
      return true
    } catch {
      try {
        await navigator.clipboard.writeText(String(text ?? ''))
        return true
      } catch {
        return false
      }
    }
  },

  /* --------- NEW for Tab Context Menu / New Window (returns Promises!) -------- */
  showTabContextMenu: (args: {
    tab: TabMeta
    screenPos: ScreenPos
    payload?: SeriesOpenPayload
  }) => {
    console.log('[preload] showTabContextMenu -> ', args)
    return ipcRenderer.invoke('tabs:showContextMenu', args) as Promise<TabMenuChoice>
  },

  openSeriesInNewWindow: (payload: SeriesOpenPayload) => {
    console.log('[preload] openSeriesInNewWindow -> ', {
      seriesKey: payload.seriesKey,
      title: payload.title,
      n: payload.instances?.length,
    })
    return ipcRenderer.invoke('headers:openSeriesInNewWindow', payload) as Promise<boolean>
  },

  helloNewHeadersWindow: () => ipcRenderer.invoke('headers:hello_new_window') as Promise<boolean>,

  getAppInfo: () => ipcRenderer.invoke('app:getInfo') as Promise<AppInfo>,

  openExternal: (url: string) => ipcRenderer.invoke('util:openExternal', url) as Promise<boolean>,

  getAppIcon: () => ipcRenderer.invoke('util:getAppIcon') as Promise<string | null>,
  openAbout: () => ipcRenderer.invoke('win:openAbout') as Promise<boolean>,
} as const

contextBridge.exposeInMainWorld('api', api)

// Optional: make TS happy in renderer
declare global {
  interface Window {
    api: typeof api
  }
}
