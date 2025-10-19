// electron/main.ts

// import * as dotenv from 'dotenv'
// dotenv.config()

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  globalShortcut,
  clipboard,
  Menu,
  screen,
  nativeImage,
  shell,
  nativeTheme
} from 'electron'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { Worker } from 'node:worker_threads'
import * as dicomParser from 'dicom-parser'
import Store from 'electron-store'

function log(...args: any[]) {
  try { console.log('[MAIN]', ...args) } catch {}
}
function debugSendHeadersTab(win: BrowserWindow, payload: any, why: string) {
  try {
    console.log('[main] sending headers:addTab because', why)
    win.webContents.send('headers:addTab', payload)
  } catch (e) {
    console.error('[main] failed to send headers:addTab', e)
  }

  // Temporary: also send the dashed variant in case the renderer listens there
  try {
    console.log('[main] also sending headers:add-tab (compat) because', why)
    win.webContents.send('headers:add-tab', payload)
  } catch (e) {
    console.error('[main] failed to send headers:add-tab', e)
  }
}

if (!app.isPackaged) {
  // Load .env for dev
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('dotenv').config()
}

type ThemeSource = 'system' | 'light' | 'dark' | `custom:${string}`


const store = new Store<{ themeSource: ThemeSource }>({
  defaults: { themeSource: 'dark' }
})
const THEME_CHANNEL = 'theme:changed'

function getSavedTheme(): ThemeSource {
  return (store.get('themeSource') ?? 'dark') as ThemeSource
}

function currentThemePayload() {
  return {
    themeSource: getSavedTheme(),
    shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
  }
}


function setAppTheme(theme: ThemeSource) {
  // For now we just map custom:* to dark/light tokens in renderer.
  // nativeTheme only accepts 'system' | 'light' | 'dark'
  const t = theme.startsWith('custom:') ? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light') : theme
  nativeTheme.themeSource = t as 'system' | 'light' | 'dark'
  store.set('themeSource', theme)
  broadcastTheme()
  // Optionally re-tint existing windows instantly:
  tintAllWindows()
}

function broadcastTheme() {
  const payload = currentThemePayload()
  for (const w of BrowserWindow.getAllWindows()) {
    try {
      const dark = nativeTheme.shouldUseDarkColors

      // Always safe
      try { w.setBackgroundColor?.(dark ? '#0b0f14' : '#ffffff') } catch {}

      // ⚠️ Titlebar overlay can throw if not enabled at creation.
      // Only attempt on Windows AND when the API exists; catch any runtime rejection.
      if (process.platform === 'win32' && typeof (w as any).setTitleBarOverlay === 'function') {
        try {
          w.setTitleBarOverlay({
            color: dark ? '#151a20' : '#f4f6f8',
            symbolColor: dark ? '#ffffff' : '#000000',
            height: 36,
          })
        } catch {
          // Skip silently if overlay wasn't enabled for this window
        }
      }

      // Finally, notify the renderer
      w.webContents.send(THEME_CHANNEL, payload)
    } catch {
      // Per-window failures should never block the others
    }
  }
}

function tintAllWindows() {
  const dark = nativeTheme.shouldUseDarkColors
  const bg = dark ? '#0b0f14' : '#ffffff'
  for (const w of BrowserWindow.getAllWindows()) {
    try { w.setBackgroundColor?.(bg) } catch {}
    // leave overlay tweaks to broadcastTheme; not required here
  }
}

function getWindowBg() {
  return nativeTheme.shouldUseDarkColors ? '#0b0f14' : '#ffffff'
}

let mainWindow: BrowserWindow | null = null
let headersWindow: BrowserWindow | null = null

let headersWindowLoaded = false
let headersRendererReady = false



function iconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'icons', 'icon-256.png')
    : path.join(process.cwd(), 'build', 'icons', 'icon-256.png')
}

type QuickMeta = {
  Modality?: string | null
  SeriesDescription?: string | null
  SOPInstanceUID?: string | null
  InstanceNumber?: number | null
  Date?: string | null
  Time?: string | null
}

type SeriesOpenPayload = {
  seriesKey: string
  title: string
  instances: { path: string; sop?: string; instanceNumber?: number; date?: string; time?: string }[]
  tabKey?: string
  activate?: boolean
}

const headersQueue: SeriesOpenPayload[] = []
const DEV_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'

let suppressMainInitialShow = false
let launchHasFiles = false
const pendingOpenPaths: string[] = []

// Queue payloads for *each* new headers window by its WebContents ID
const newWindowInitialTabs = new Map<number, SeriesOpenPayload[]>();


function queueInitialTabFor(win: BrowserWindow, payload: SeriesOpenPayload) {
  const id = win.webContents.id;
  const list = newWindowInitialTabs.get(id) ?? [];
  list.push(payload);
  newWindowInitialTabs.set(id, list);
}

function flushInitialTabsTo(win: BrowserWindow) {
  const id = win.webContents.id;
  const list = newWindowInitialTabs.get(id);
  if (!list || list.length === 0) return;

  console.log('[main] flushing', list.length, 'queued tab(s) to new window', id);
  for (const p of list) {
    win.webContents.send('headers:add-tab', { ...p, activate: true });
  }
  newWindowInitialTabs.delete(id);
}


/* ----------------------- Fast, small DICOM meta reader ----------------------- */
function quickDicomMeta(file: string): QuickMeta | null {
  try {
    const buf = fs.readFileSync(file)
    const ds = dicomParser.parseDicom(new Uint8Array(buf), { untilTag: 'x7fe00010' })

    const str = (t: string) => ds.string(t) || null
    const num = (t: string) => {
      const s = str(t)
      if (s == null || s === '') return null
      const n = Number(s)
      return Number.isFinite(n) ? n : null
    }
    const first = (...vals: (string | null)[]) => vals.find(v => v && v.length > 0) || null

    const date =
      first(
        str('x00080022'), // AcquisitionDate
        str('x00080012'), // InstanceCreationDate
        str('x00080023'), // ContentDate
        str('x00080021'), // SeriesDate
      )

    const time =
      first(
        str('x00080032'), // AcquisitionTime
        str('x00080013'), // InstanceCreationTime
        str('x00080033'), // ContentTime
        str('x00080031'), // SeriesTime
      )

    return {
      Modality:          str('x00080060'),
      SeriesDescription: str('x0008103e'),
      SOPInstanceUID:    str('x00080018'),
      InstanceNumber:    num('x00200013'),
      Date:              date,
      Time:              time,
    }
  } catch {
    return null
  }
}

/* ----------------------------- Headers queuing ------------------------------ */
function sendAddTab(p: SeriesOpenPayload) {
  if (!headersWindow || headersWindow.isDestroyed()) return
  headersWindow.webContents.send('headers:add-tab', p)
}

function bringToFrontFor(win: BrowserWindow) {
  if (!win || win.isDestroyed()) return;

  // Make sure it's visible in taskbar and focusable
  try { win.setSkipTaskbar?.(false) } catch {}
  try { (win as any).setFocusable?.(true) } catch {}

  // Show & focus sequence
  win.show();                   // show window if hidden
  win.moveTop?.();              // ensure top of Z-order (Windows API)
  win.focus();                  // request focus
  win.webContents.focus();      // focus into webview

  // Pulse Always-On-Top to reliably steal focus on Win/Linux
  win.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true });
  win.setAlwaysOnTop(true, 'screen-saver');
  setTimeout(() => {
    if (win.isDestroyed()) return;
    win.setAlwaysOnTop(false);
    win.setVisibleOnAllWorkspaces?.(false);
  }, 200);

  // Extra nudges for Windows
  if (process.platform === 'win32') {
    // Flash taskbar icon (stops once user interacts)
    try { win.flashFrame(true) } catch {}

    // One more delayed nudge after the menu definitely closed
    setTimeout(() => {
      if (win.isDestroyed()) return;
      win.moveTop?.();
      win.focus();
      win.webContents.focus();
      try { win.flashFrame(false) } catch {}
    }, 150);
  }
}

function bringHeadersToFront() {
  if (!headersWindow) return
  bringToFrontFor(headersWindow)
}

/** Send immediately if ready; otherwise queue and ensure window exists */
async function sendOrQueueAddTab(p: SeriesOpenPayload) {
  if (headersWindow && !headersWindow.isDestroyed() && headersWindowLoaded) {
    sendAddTab(p)
    bringHeadersToFront()
    return
  }
  headersQueue.push(p)
  await ensureHeadersWindow()
  flushIfFullyReady()
}

function flushIfFullyReady() {
  if (!headersWindow || headersWindow.isDestroyed()) return
  if (!headersWindowLoaded || !headersRendererReady) return
  while (headersQueue.length) sendAddTab(headersQueue.shift()!)
  bringHeadersToFront()
}

/* ------------------------ Helpers to open single files ----------------------- */
async function openSingleFileAsTab(filePath: string) {
  const meta = (quickDicomMeta(filePath) ?? {}) as QuickMeta
  const title = `${meta.Modality || 'UNK'} — ${meta.SeriesDescription || path.basename(filePath)}`
  const payload: SeriesOpenPayload = {
    seriesKey: `file:${filePath}`,
    title,
    instances: [{
      path: filePath,
      sop: meta.SOPInstanceUID || undefined,
      instanceNumber: meta.InstanceNumber ?? undefined,
      date: meta.Date || undefined,
      time: meta.Time || undefined,
    }],
    tabKey: filePath,
    activate: true,
  }
  await sendOrQueueAddTab(payload)
}

/** Open a list of file paths as individual single-file tabs */
async function openDicomFiles(paths: string[]) {
  if (!paths.length) return
  for (const p of paths) {
    await openSingleFileAsTab(p)
  }
}

/* --------------------------------- Windows ---------------------------------- */
async function createStandaloneHeadersWindow(): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    icon: process.platform === 'linux' ? iconPath() : undefined,
    width: 1200,
    height: 800,
    backgroundColor: getWindowBg(),
    autoHideMenuBar: true,
    show: false,
    frame: false,
    fullscreen: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hidden',
    // titleBarOverlay: { height: 36 },
  })

  const isDev = process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL
  if (isDev) {
    const url = `${DEV_URL.replace(/\/?$/, '/') }#/headers`
    await win.loadURL(url)
  } else {
    const file = path.join(app.getAppPath(), 'dist', 'index.html')
    // const file = distIndexPath()
    log('loadFile (headers):', file, 'exists:', fs.existsSync(file))
    await win.loadFile(file, { hash: '/headers' })
  }

  // extra event logs (helps us see exact timing)
  win.webContents.on('did-start-loading', () => console.log('[headers] did-start-loading'))
  win.webContents.on('dom-ready', () => console.log('[headers] dom-ready'))
  win.webContents.on('did-frame-finish-load', (_e, isMain, frameProcessId, frameRoutingId) =>
  console.log('[headers] did-frame-finish-load', { isMain, frameProcessId, frameRoutingId })
  )
  win.webContents.on('did-finish-load', () => console.log('[headers] did-finish-load'))

  // diagnostics
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    log('did-fail-load (headers)', code, desc, url)
    win.webContents.openDevTools({ mode: 'right' })
  })
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    log('renderer console (headers):', { level, message, line, sourceId })
  })

  // Max + show when ready
  win.once('ready-to-show', () => {
    win.maximize()
    bringToFrontFor(win)
  })

  return win
}

async function createWindow(opts?: { initiallyHidden?: boolean }) {
  mainWindow = new BrowserWindow({
    icon: process.platform === 'linux' ? iconPath() : undefined,
    width: 1200,
    height: 800,
    frame: false,
    backgroundColor: getWindowBg(),
    autoHideMenuBar: true,
    fullscreen: false,
    fullscreenable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hidden',
    // titleBarOverlay: { height: 36 }
  })

  const isDev = process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL
  if (isDev) {
    await mainWindow.loadURL(DEV_URL)
  } else {
    const file = path.join(app.getAppPath(), 'dist', 'index.html')
    log('loadFile (main):', file, 'exists:', fs.existsSync(file))
    await mainWindow.loadFile(file)
  }

  // diagnostics
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    log('did-fail-load (main)', code, desc, url)
    mainWindow!.webContents.openDevTools({ mode: 'right' })
  })
  mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    log('renderer console (main):', { level, message, line, sourceId })
  })

  mainWindow.once('ready-to-show', () => {
    if (opts?.initiallyHidden || suppressMainInitialShow) return
    mainWindow!.maximize()
    mainWindow!.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

}

async function ensureHeadersWindow() {
  if (headersWindow && !headersWindow.isDestroyed()) return headersWindow

  headersWindowLoaded = false
  headersRendererReady = false

  headersWindow = new BrowserWindow({
    icon: process.platform === 'linux' ? iconPath() : undefined,
    width: 1200,
    height: 800,
    backgroundColor: getWindowBg(),
    autoHideMenuBar: true,
    show: false,
    frame: false,
    fullscreen: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hidden',
  })

  headersWindow.webContents.on('did-finish-load', () => {
    headersWindowLoaded = true
    flushIfFullyReady()
  })

  const isDev = process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL
  if (isDev) {
    const url = `${DEV_URL.replace(/\/?$/, '/') }#/headers`
    await headersWindow.loadURL(url)
  } else {
    const file = path.join(app.getAppPath(), 'dist', 'index.html')
    await headersWindow.loadFile(file, { hash: '/headers' })
  }

  headersWindowLoaded = true
  flushIfFullyReady()

  headersWindow.once('ready-to-show', () => {
    headersWindow!.maximize()
    headersWindow!.show()
    headersWindow!.focus()
  })

  headersWindow.on('closed', () => {
    headersWindow = null
    headersWindowLoaded = false
    headersRendererReady = false
  })

  return headersWindow
}

function createAboutWindow(parent?: BrowserWindow) {
  const name = app.getName()
  const version = app.getVersion()

  const about = new BrowserWindow({
    width: 420,
    height: 310,
    resizable: false,
    minimizable: false,
    maximizable: false,
    frame: false,
    show: false,
    backgroundColor: getWindowBg(),
    autoHideMenuBar: true,
    parent,
    modal: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  })

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>About ${name}</title>
<style>
  body { margin:0; font-family: ui-sans-serif, system-ui; background:#0b0f14; color:#e6edf3; }
  .wrap { padding:16px; }
  .title { font-size:16px; opacity:.9; display:flex; align-items:center; gap:8px; }
  .muted { color:#a7b0be; }
  .box { border:1px solid #1f2630; border-radius:8px; padding:12px; margin-top:12px; background:#0e1420; }
  .row { margin:6px 0; }
  .btn { position:absolute; top:8px; right:8px; width:24px; height:24px; border-radius:6px;
          border:1px solid #1f2630; background:#0e1420; color:#e6edf3; cursor:pointer; }
</style>
</head>
<body>
  <button class="btn" onclick="window.close()" title="Close">×</button>
  <div class="wrap">
    <div class="title">About <strong>${name}</strong></div>
    <div class="box">
      <div class="row"><strong>Version:</strong> ${version}</div>
      <div class="row muted">Electron ${process.versions.electron} • Chromium ${process.versions.chrome}</div>
      <div class="row muted">Node ${process.versions.node}</div>
    </div>
    <div class="box">
      <div class="row">A tiny utility to inspect DICOM headers.</div>
      <div class="row muted">© ${new Date().getFullYear()}</div>
    </div>
  </div>
</body>
</html>`

  about.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  about.once('ready-to-show', () => { about.show(); about.focus() })
  return about
}

/* ---------------------------- Single instance lock --------------------------- */
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    // On Windows, non-flag args after exe path:
    const files = argv
      .slice(1)
      .filter(a => !a.startsWith('--') && /\.(dcm|dicom|ima)$/i.test(a) && fs.existsSync(a))

    if (files.length) {
      files.forEach(p => void openSingleFileAsTab(p))
    } else if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

/* ------------------------- First launch "Open with…" ------------------------ */
if (process.platform === 'win32') {
  const firstArgs = process.argv.slice(1).filter(a => !a.startsWith('--'))
  const files = firstArgs.filter(p => /\.(dcm|dicom|ima)$/i.test(p) && fs.existsSync(p))
  if (files.length) {
    pendingOpenPaths.push(...files)
    suppressMainInitialShow = true
    launchHasFiles = true
  }
}

/* -------------------------------- App Ready --------------------------------- */
app.whenReady().then(async () => {
  setAppTheme(getSavedTheme())

  // If OS theme flips and we're in `system`, notify renderers
  nativeTheme.on('updated', () => {
    if (getSavedTheme() === 'system') {
      broadcastTheme()
      tintAllWindows()
    }
  })

  if (launchHasFiles) {
    await openDicomFiles(pendingOpenPaths.splice(0))
  } else {
    await createWindow()
  }

  globalShortcut.register('F11', () => {
    const wins = [mainWindow, headersWindow].filter(Boolean) as BrowserWindow[]
    for (const win of wins) {
      if (win.isMaximized()) win.unmaximize()
      else win.maximize()
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })

  // macOS: files opened via Finder
  app.on('open-file', (event, filePath) => {
    event.preventDefault()
    if (fs.existsSync(filePath)) void openSingleFileAsTab(filePath)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

/* ------------------------------ IPC: window ops ----------------------------- */
ipcMain.handle('theme:get', () => currentThemePayload())
ipcMain.handle('win:minimize', (e) => {
  BrowserWindow.fromWebContents(e.sender)?.minimize()
})
ipcMain.handle('win:maximize', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  if (!win) return
  if (win.isMaximized()) win.unmaximize()
  else win.maximize()
})
ipcMain.handle('win:close', (e) => {
  BrowserWindow.fromWebContents(e.sender)?.close()
})
ipcMain.handle('win:fullscreenToggle', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  if (!win) return
  if (win.isMaximized()) win.unmaximize()
  else win.maximize()
})

/* Set the theme*/
ipcMain.handle('theme:set', (_evt, theme: ThemeSource) => {
  if (typeof theme !== 'string') return currentThemePayload()
  // Accept 'system' | 'light' | 'dark' | 'custom:<name>'
  if (theme === 'system' || theme === 'light' || theme === 'dark' || theme.startsWith('custom:')) {
    setAppTheme(theme)
  }
  return currentThemePayload()
})

/* ------------------ Explicit dialogs: Open File / Open Folder --------------- */
type ScanOptions = { ignorePrivate: boolean; ignoreBulk: boolean; redactPHI: boolean }

ipcMain.handle('dialog:chooseFile', async () => {
  const ret = await dialog.showOpenDialog({
    title: 'Open DICOM file',
    buttonLabel: 'Open',
    properties: ['openFile'],
    filters: [
      { name: 'DICOM', extensions: ['dcm', 'ima', 'dicom'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  })
  if (ret.canceled || ret.filePaths.length === 0) return null
  const p = ret.filePaths[0]
  const isDir = (() => {
    try { return fs.statSync(p).isDirectory() } catch { return false }
  })()
  return { path: p, kind: isDir ? 'directory' as const : 'file' as const }
})

ipcMain.handle('dialog:chooseDir', async () => {
  const ret = await dialog.showOpenDialog({
    title: 'Open DICOM folder',
    buttonLabel: 'Open',
    properties: ['openDirectory'],
  })
  if (ret.canceled || ret.filePaths.length === 0) return null
  const p = ret.filePaths[0]
  return { path: p, kind: 'directory' as const }
})

/* ------------------------------ Scan / Workers ------------------------------ */
ipcMain.handle('scan:start', async (_evt, rootPath: string, options: ScanOptions) => {
  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const worker = new Worker(path.join(__dirname, 'worker', 'scanWorker.js'), {
    workerData: { jobId, rootPath, options },
  })
  worker.on('message', (msg) => mainWindow?.webContents.send(`scan:${msg.type}`, msg))
  worker.on('error', (err) => mainWindow?.webContents.send('scan:error', { jobId, error: String(err) }))
  return jobId
})

ipcMain.handle('headers:get', async (_evt, filePath: string, options: ScanOptions) => {
  return new Promise((resolve) => {
    const jobId = `headers_${Date.now()}`
    const worker = new Worker(path.join(__dirname, 'worker', 'scanWorker.js'), {
      workerData: { jobId, singleFile: filePath, mode: 'headers', options },
    })
    worker.on('message', (msg) => {
      if (msg?.type === 'headers') resolve(msg.headers)
    })
    worker.on('error', (err) => resolve({ error: String(err) }))
    worker.on('exit', (code) => {
      if (code !== 0) resolve({ error: `headers worker exited with code ${code}` })
    })
  })
})

/* --------------------------- Headers window IPC ----------------------------- */
ipcMain.handle('headers:openSeries', async (_evt, payload: SeriesOpenPayload) => {
  const firstPath = payload.instances?.[0]?.path
  const tabKey = firstPath || (payload.title ?? `series_${Date.now()}`)
  const enriched = { ...payload, tabKey, activate: true }
  void sendOrQueueAddTab(enriched)
  return true
})

ipcMain.handle('headers:openSingleFile', async (_evt, filePath: string) => {
  await openSingleFileAsTab(filePath) // uses quickDicomMeta internally
  return true
})

ipcMain.handle('headers:ping', () => {
  headersRendererReady = true
  flushIfFullyReady()
  return true
})

/* ---- Right-click tab context menu (performs action in main, returns choice) --- */
ipcMain.handle('tabs:showContextMenu', async (evt, args: any) => {
  console.log('[main] tabs:showContextMenu <- ', args)
  const saved = getSavedTheme()
  const mapped = saved.startsWith('custom:')
  ? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light')
  : saved
  nativeTheme.themeSource = mapped as 'system' | 'light' | 'dark'

  // Accept { tab: {id,title,firstPath}, screenPos?, payload? }
  const tab = args?.tab ?? {}
  let screenPos = args?.screenPos
  const payload: SeriesOpenPayload | undefined = args?.payload

  if (!screenPos || typeof screenPos.x !== 'number' || typeof screenPos.y !== 'number') {
    try { screenPos = screen.getCursorScreenPoint() } catch { screenPos = { x: 0, y: 0 } }
  }

  const win = BrowserWindow.fromWebContents(evt.sender)
  if (!win) {
    console.log('[main] tabs:showContextMenu: no window for sender')
    return 'cancel'
  }

  return await new Promise<'copyPath' | 'splitRight' | 'splitLeft' | 'openInNewWindow' | 'cancel'>(resolve => {
    let resolved = false
    const finish = async (choice: 'copyPath' | 'splitRight' | 'splitLeft' | 'openInNewWindow' | 'cancel') => {
      if (resolved) return
      resolved = true
      console.log('[main] menu choice ->', choice)

      // Perform side-effect in main so it works even if renderer doesn't
      try {
        if (choice === 'copyPath' && tab.firstPath) {
          clipboard.writeText(String(tab.firstPath))
          console.log('[main] copied path to clipboard:', tab.firstPath)
        } else if (choice === 'openInNewWindow' && payload) {
          // console.log('[main] opening series in new window…', { title: payload.title, n: payload.instances?.length })
          // const newWin = await createStandaloneHeadersWindow()

          // // Queue the payload for that specific window, then flush either on did-finish-load
          // // or immediately if not loading. Also handle the explicit hello/flush from renderer.
          // queueInitialTabFor(newWin, payload);

          // const sendNow = () => {
          //   console.log('[main] (did-finish-load) flushing to new window');
          //   flushInitialTabsTo(newWin);
          //   bringToFrontFor(newWin);
          //   // Small nudge after the menu closes to reliably steal focus on Win/Linux
          //   setTimeout(() => bringToFrontFor(newWin), 50)
          // };

          // if (newWin.webContents.isLoading()) {
          //   newWin.webContents.once('did-finish-load', sendNow)
          // } else {
          //   sendNow()
          // }
        }
      } catch (err) {
        console.warn('[main] action failed:', err)
      }

      resolve(choice)
    }

    const template = [
      { label: 'Copy Path', enabled: !!tab.firstPath, click: () => void finish('copyPath') },
      { type: 'separator' as const },
      { label: 'Split Right', click: () => void finish('splitRight') },
      { label: 'Split Left',  click: () => void finish('splitLeft') },
      { type: 'separator' as const },
      { label: 'Open in New Window', enabled: !!payload, click: () => void finish('openInNewWindow') },
    ]

    const menu = Menu.buildFromTemplate(template)
    console.log('[main] popup menu at', screenPos)
    menu.popup({
      window: win,
      x: Math.round(screenPos.x),
      y: Math.round(screenPos.y),
      callback: () => {
        if (!resolved) { console.log('[main] menu dismissed'); setTimeout(() => finish('cancel'), 0) }
      },
    })
  })
})

/* ---- Open the given series payload in a brand-new Headers window (IPC path) - */
ipcMain.handle('headers:openSeriesInNewWindow', async (_evt, payload: SeriesOpenPayload) => {
  console.log('[main] headers:openSeriesInNewWindow <-', { title: payload?.title, n: payload?.instances?.length });
  const newWin = await createStandaloneHeadersWindow();
  
  // Always log the current state
  const loading = newWin.webContents.isLoadingMainFrame()
  console.log('[main] new headers window id=', newWin.webContents.id, 'isLoadingMainFrame=', loading)

  // send once immediately if possible...
  if (!loading) {
    debugSendHeadersTab(newWin, payload, 'main-frame not loading (immediate)')
  } else {
    console.log('[main] main-frame still loading -> will wait for did-finish-load')
  }

  // ...then also send on the key lifecycle events (belt-and-suspenders while debugging)
  const onceFinish = () => {
    debugSendHeadersTab(newWin, payload, 'did-finish-load')
    newWin.webContents.removeListener('did-finish-load', onceFinish)
  }
  newWin.webContents.on('did-finish-load', onceFinish)

  const onceDomReady = () => {
    debugSendHeadersTab(newWin, payload, 'dom-ready')
    newWin.webContents.removeListener('dom-ready', onceDomReady)
  }
  newWin.webContents.on('dom-ready', onceDomReady)

  // Optional a short delayed send in case React mounted after did-finish-load
  setTimeout(() => {
    if (!newWin.isDestroyed()) {
      debugSendHeadersTab(newWin, payload, 'fallback timeout 250ms after creation')
    }
  }, 250)

  try { newWin.show(); newWin.focus() } catch {}

  return true

})

ipcMain.handle('headers:hello_new_window', (evt) => {
  const win = BrowserWindow.fromWebContents(evt.sender);
  if (!win) return false;
  console.log('[main] hello from new headers window', win.webContents.id, '-> flushInitialTabsTo()');
  flushInitialTabsTo(win);
  bringToFrontFor(win);
  return true;
});


// Return app meta (pulls author/homepage from package.json)
// --- About window (small, frameless, standalone HTML) ---
ipcMain.handle('win:openAbout', async () => {
  const name = app.getName();
  const version = app.getVersion();

  const about = new BrowserWindow({
    useContentSize: true,        
    width: 440,                   
    height: 300,                  
    resizable: false,
    minimizable: false,
    maximizable: false,
    frame: false,
    backgroundColor: getWindowBg(),
    show: false,
    alwaysOnTop: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const openExternal = (url: string) => { try { shell.openExternal(url); } catch {} };
  about.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
  about.webContents.on('will-navigate', (e, url) => { e.preventDefault(); openExternal(url); });

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>About ${name}</title>
<style>
  :root { color-scheme: dark; }
  html, body { margin:0; background:#0b0f14; color:#e6edf3; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto; overflow:hidden; } /* no scrollbars */
  .wrap { padding:16px; }
  .title { font-size:16px; opacity:.9; display:flex; align-items:center; gap:8px; }
  .muted { color:#a7b0be; }
  .box { border:1px solid #1f2630; border-radius:8px; padding:12px; margin-top:12px; background:#0e1420; }
  .row { margin:6px 0; }
  .btn { position:absolute; top:8px; right:8px; width:24px; height:24px; border-radius:6px;
         border:1px solid #1f2630; background:#0e1420; color:#e6edf3; cursor:pointer; }
  a { color:#7aa2ff; text-decoration:none; }
  a:hover { text-decoration:underline; }
</style>
</head>
<body>
  <button class="btn" onclick="window.close()" title="Close">×</button>
  <div class="wrap">
    <div class="title">About <strong>${name}</strong></div>
    <div class="box">
      <div class="row"><strong>Version:</strong> ${version}</div>
      <div class="row muted">Electron ${process.versions.electron} • Chromium ${process.versions.chrome}</div>
      <div class="row muted">Node ${process.versions.node}</div>
    </div>
    <div class="box">
      <div class="row">A tiny utility to inspect DICOM headers.</div>
      <div class="row"><strong>Author:</strong> Yasin Abdulkadir</div>
      <div class="row"><strong>Website:</strong> <a href="https://github.com/YAAbdulkadir/dicom-headers" target="_blank" rel="noreferrer">github.com/YAAbdulkadir/dicom-headers</a></div>
      <div class="row muted">© ${new Date().getFullYear()}</div>
    </div>
  </div>
</body>
</html>`;

  await about.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

  // Measure content size and resize window to fit exactly (no scrollbars)
  try {
    const { w, h } = await about.webContents.executeJavaScript(
      `(() => {
        const pad = 0; // we already include padding in layout
        const doc = document.documentElement;
        const width = Math.ceil(Math.max(doc.scrollWidth, doc.clientWidth)) + pad;
        const height = Math.ceil(Math.max(doc.scrollHeight, doc.clientHeight)) + pad;
        return { w: width, h: height };
      })();`
    );

    // Add a tiny safety margin to avoid accidental clipping on some fonts/DPI
    const margin = 4;
    about.setContentSize(w + margin, h + margin);
  } catch {
    // fallback: leave default size
  }

  about.show();
  about.focus();
  return true;
});


// Open external URLs safely
ipcMain.handle('util:openExternal', async (_evt, url: string) => {
  try {
    await shell.openExternal(String(url))
    return true
  } catch {
    return false
  }
})

/* --------------------------------- Utility ---------------------------------- */
ipcMain.handle('util:copyText', (_evt, text: string) => {
  clipboard.writeText(String(text ?? ''))
  return true
})

ipcMain.handle('util:getAppIcon', async () => {
  try {
    const p = app.isPackaged
      ? path.join(process.resourcesPath, 'icons', 'icon-256.png')
      : path.join(process.cwd(), 'build', 'icons', 'icon-256.png');

    // Optional: helpful logging while you test
    // console.log('[main] util:getAppIcon path =', p, 'exists?', fs.existsSync(p));

    const b64 = fs.readFileSync(p).toString('base64');
    return `data:image/png;base64,${b64}`;
  } catch (e) {
    // Fallback: try getting the executable’s icon (Windows)
    try {
      const img = await app.getFileIcon(process.execPath, { size: 'large' as any });
      return img.toDataURL();
    } catch {}
    return null;
  }
});
