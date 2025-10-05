// electron/main.ts

// import * as dotenv from 'dotenv'
// dotenv.config()

import { app, BrowserWindow, dialog, ipcMain, globalShortcut, clipboard } from 'electron'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { Worker } from 'node:worker_threads'
import * as dicomParser from 'dicom-parser'

if (!app.isPackaged) {
  // Load .env for dev
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('dotenv').config()
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

function bringHeadersToFront() {
  if (!headersWindow) return
  headersWindow.show()
  headersWindow.focus()
  headersWindow.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true })
  headersWindow.setAlwaysOnTop(true, 'screen-saver')
  setTimeout(() => {
    headersWindow?.setAlwaysOnTop(false)
    headersWindow?.setVisibleOnAllWorkspaces?.(false)
  }, 250)
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
async function createWindow(opts?: { initiallyHidden?: boolean }) {
  mainWindow = new BrowserWindow({
    icon: process.platform === 'linux' ? iconPath() : undefined,
    width: 1200,
    height: 800,
    frame: false,
    backgroundColor: '#0b0f14',
    autoHideMenuBar: true,
    fullscreen: false,
    fullscreenable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const isDev = process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL
  if (isDev) {
    await mainWindow.loadURL(DEV_URL)
  } else {
    await mainWindow.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'))
  }

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
    backgroundColor: '#0b0f14',
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

/* ------------------ Explicit dialogs: Open File / Open Folder --------------- */
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
type ScanOptions = { ignorePrivate: boolean; ignoreBulk: boolean; redactPHI: boolean }

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
  await openSingleFileAsTab(filePath);    // uses quickDicomMeta internally
  return true;
});

ipcMain.handle('headers:ping', () => {
  headersRendererReady = true
  flushIfFullyReady()
  return true
})

/* --------------------------------- Utility ---------------------------------- */
ipcMain.handle('util:copyText', (_evt, text: string) => {
  clipboard.writeText(String(text ?? ''))
  return true
})







// // electron/main.ts

// // import * as dotenv from 'dotenv'
// // dotenv.config()

// import { app, BrowserWindow, dialog, ipcMain, globalShortcut, clipboard } from 'electron'
// import * as path from 'node:path'
// import * as fs from 'node:fs'
// import { Worker } from 'node:worker_threads'
// import * as dicomParser from 'dicom-parser'

// if (!app.isPackaged) {
//   // Load .env for dev
//   // eslint-disable-next-line @typescript-eslint/no-var-requires
//   require('dotenv').config()
// }



// let mainWindow: BrowserWindow | null = null
// let headersWindow: BrowserWindow | null = null

// let headersWindowLoaded = false
// let headersRendererReady = false

// function iconPath() {
//   return app.isPackaged
//     ? path.join(process.resourcesPath, 'icons', 'icon-256.png')
//     : path.join(process.cwd(), 'build', 'icons', 'icon-256.png')
// }

// type SeriesOpenPayload = {
//   seriesKey: string
//   title: string
//   instances: { path: string; sop?: string; instanceNumber?: number; date?: string; time?: string }[]
//   tabKey?: string
//   activate?: boolean
// }

// const headersQueue: SeriesOpenPayload[] = []
// const DEV_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'

// let suppressMainInitialShow = false
// let launchHasFiles = false
// const pendingOpenPaths: string[] = []

// // Helper: open one or more files as "single-file headers" tabs
// async function openDicomFiles(paths: string[]) {
//   if (!paths.length) return
//   const win = await ensureHeadersWindow()
//   for (const p of paths) {
//     const title = path.basename(p)
//     const seriesKey = `file:${p}` // stable key per file
//     headersQueue.push({
//       seriesKey,
//       title,
//       instances: [{ path: p }],
//       tabKey: p,
//       activate: true,
//     })
//   }
//   flushIfFullyReady()
//   win.show()
//   win.focus()
// }

// /* ----------------------- Fast, small DICOM meta reader ----------------------- */
// function quickDicomMeta(file: string) {
//   try {
//     const buf = fs.readFileSync(file)
//     const ds = dicomParser.parseDicom(new Uint8Array(buf), { untilTag: 'x7fe00010' })

//     const str = (t: string) => ds.string(t) || null
//     const num = (t: string) => {
//       const s = str(t)
//       if (s == null || s === '') return null
//       const n = Number(s)
//       return Number.isFinite(n) ? n : null
//     }
//     const first = (...vals: (string | null)[]) => vals.find(v => v && v.length > 0) || null

//     const date = 
//       first(
//         str('x00080022'),   // AcquisitionDate
//         str('x00080012'),   // InstanceCreationDate
//         str('x00080023'),   // ContentDate
//         str('x00080021'),   // SeriesDate
//       )

//     const time =
//       first(
//         str('x00080032'),   // AcquisitionTime
//         str('x00080013'),   // InstanceCreationTime
//         str('x00080033'),   // ContentTime
//         str('x00080031'),   // SeriesTime
//       )

//     return {
//       Modality:           str('x00080060'),
//       SeriesDescription:  str('x0008103e'),
//       SOPInstanceUID:     str('x00080018'),
//       InstanceNumber:     str('x00200013'),
//       Date:               date,
//       Time:               time,  
//     }
//   } catch {
//     return null
//   }
// }

// /* ----------------------------- Headers queuing ------------------------------ */
// function sendAddTab(p: SeriesOpenPayload) {
//   if (!headersWindow || headersWindow.isDestroyed()) return
//   headersWindow.webContents.send('headers:add-tab', p)
// }

// function bringHeadersToFront() {
//   if (!headersWindow) return
//   // Nudge focus on Windows reliably
//   headersWindow.show()
//   headersWindow.focus()
//   headersWindow.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true })
//   headersWindow.setAlwaysOnTop(true, 'screen-saver')  // temporarily
//   setTimeout(() => {
//     headersWindow?.setAlwaysOnTop(false)
//     headersWindow?.setVisibleOnAllWorkspaces?.(false)
//   }, 250)
// }

// /** Send immediately if ready; otherwise queue and ensure window exists */
// async function sendOrQueueAddTab(p: SeriesOpenPayload) {
//   if (headersWindow && !headersWindow.isDestroyed() && headersWindowLoaded) {
//     sendAddTab(p)   // fast path (no queue/flush)
//     bringHeadersToFront()
//     return
//   }
//   // window not ready - queue then ensure
//   headersQueue.push(p)
//   await ensureHeadersWindow()
//   flushIfFullyReady()
// }

// function flushIfFullyReady() {
//   if (!headersWindow || headersWindow.isDestroyed()) return
//   if (!headersWindowLoaded || !headersRendererReady) return
//   while (headersQueue.length) sendAddTab(headersQueue.shift()!)
//     bringHeadersToFront()
//   // const q = headersQueue.splice(0, headersQueue.length)
//   // q.forEach(sendAddTab)
// }

// async function createWindow(opts?: { initiallyHidden?: boolean }) {
//   mainWindow = new BrowserWindow({
//     icon: process.platform === 'linux' ? iconPath() : undefined,
//     width: 1200,
//     height: 800,
//     frame: false,
//     backgroundColor: '#0b0f14',
//     autoHideMenuBar: true,
//     fullscreen: false,
//     fullscreenable: false,
//     show: false,
//     webPreferences: {
//       preload: path.join(__dirname, 'preload.js'),
//       contextIsolation: true,
//       nodeIntegration: false,
//     },
//   })

//   const isDev = process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL
//   if (isDev) {
//     await mainWindow.loadURL(DEV_URL)
//   } else {
//     await mainWindow.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'))
//   }

//   mainWindow.once('ready-to-show', () => {
//     // only show if we're not suppressing the initial reveal
//     if (opts?.initiallyHidden || suppressMainInitialShow) return
//     mainWindow!.maximize()
//     mainWindow!.show()
//   })

//   mainWindow.on('closed', () => {
//     mainWindow = null
//   })
// }

// async function ensureHeadersWindow() {
//   if (headersWindow && !headersWindow.isDestroyed()) return headersWindow

//   headersWindowLoaded = false
//   headersRendererReady = false

//   headersWindow = new BrowserWindow({
//     icon: process.platform === 'linux' ? iconPath() : undefined,
//     width: 1200,
//     height: 800,
//     backgroundColor: '#0b0f14',
//     autoHideMenuBar: true,
//     show: false,
//     frame: false,
//     fullscreen: false,
//     fullscreenable: false,
//     webPreferences: {
//       preload: path.join(__dirname, 'preload.js'),
//       contextIsolation: true,
//       nodeIntegration: false,
//     },
//   })

//   headersWindow.webContents.on('did-finish-load', () => {
//     headersWindowLoaded = true
//     flushIfFullyReady()
//   })

//   const isDev = process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL
//   if (isDev) {
//     const url = `${DEV_URL.replace(/\/?$/, '/') }#/headers`
//     await headersWindow.loadURL(url)
//   } else {
//     const file = path.join(app.getAppPath(), 'dist', 'index.html')
//     await headersWindow.loadFile(file, { hash: '/headers' })
//   }

//   // If load finished earlier than the event, make sure flags are set
//   headersWindowLoaded = true
//   flushIfFullyReady()

//   headersWindow.once('ready-to-show', () => {
//     headersWindow!.maximize()
//     headersWindow!.show()
//     headersWindow!.focus()
//   })

//   headersWindow.on('closed', () => {
//     headersWindow = null
//     headersWindowLoaded = false
//     headersRendererReady = false
//   })

//   return headersWindow
// }

// // Ensure single instance so second launches forward the file paths
// const gotLock = app.requestSingleInstanceLock()
// if (!gotLock) {
//   app.quit()
// } else {
//   app.on('second-instance', (_event, argv) => {
//     const files = argv.slice(1).filter(p => /\.(dcm|dicom|ima)$/i.test(p))
//     files.forEach(p => {
//       const payload: SeriesOpenPayload = {
//         seriesKey: `file:${p}`,
//         title: path.basename(p),
//         instances: [{ path: p }],
//         tabKey: p,
//         activate: true,
//       }
//       void sendOrQueueAddTab(payload)
//     })
//   })
//   // app.on('second-instance', (_event, argv) => {
//   //   // On Windows, file paths come through argv
//   //   const extra = argv.slice(1).filter(a => !a.startsWith('--'))
//   //   const files = extra.filter(p =>
//   //     /\.(dcm|dicom|ima)$/i.test(p)
//   //   )
//   //   if (files.length) {
//   //     // If app is running, open immediately
//   //     void openDicomFiles(files)
//   //   } else if (mainWindow) {
//   //     // Just focus the window
//   //     if (mainWindow.isMinimized()) mainWindow.restore()
//   //       mainWindow.focus()
//   //   }
//   // })
// }

// // First launch: collect any file args from Explorer "Open with"
// if (process.platform == 'win32') {
//   const firstArgs = process.argv.slice(1).filter(a => !a.startsWith('--'))
//   const files = firstArgs.filter(p => /\.(dcm|dicom|ima)$/i.test(p))
//   if (files.length) {
//     pendingOpenPaths.push(...files)
//     suppressMainInitialShow = true
//     launchHasFiles = true
//   }
// }

// app.whenReady().then(async () => {
//   // If we have pending files (Open With), keep main hidden on first show
//   if (launchHasFiles) {
//     // Skip main window entirely; just open headers
//     await openDicomFiles(pendingOpenPaths.splice(0))
//   } else {
//     await createWindow()
//   }
//   // void createWindow( { initiallyHidden: suppressMainInitialShow })

//   // If launched with files, open headers immediately and focus that window
//   // if (pendingOpenPaths.length) {
//   //   void openDicomFiles(pendingOpenPaths.splice(0, pendingOpenPaths.length))
//   // }

//   globalShortcut.register('F11', () => {
//     const wins = [mainWindow, headersWindow].filter(Boolean) as BrowserWindow[]
//     for (const win of wins) {
//       if (win.isMaximized()) win.unmaximize()
//       else win.maximize()
//     }
//   })

//   app.on('activate', () => {
//     if (BrowserWindow.getAllWindows().length === 0) void createWindow()
//   })

//   app.on('open-file', (event, filePath) => {
//     event.preventDefault()
//     pendingOpenPaths.push(filePath)
//     if (app.isReady()) void openDicomFiles([filePath])
//   })
// })

// app.on('window-all-closed', () => {
//   if (process.platform !== 'darwin') app.quit()
// })
// app.on('will-quit', () => {
//   globalShortcut.unregisterAll()
// })

// /* ---------- Window control IPC ---------- */
// ipcMain.handle('win:minimize', (e) => {
//   BrowserWindow.fromWebContents(e.sender)?.minimize()
// })
// ipcMain.handle('win:maximize', (e) => {
//   const win = BrowserWindow.fromWebContents(e.sender)
//   if (!win) return
//   if (win.isMaximized()) win.unmaximize()
//   else win.maximize()
// })
// ipcMain.handle('win:close', (e) => {
//   BrowserWindow.fromWebContents(e.sender)?.close()
// })
// ipcMain.handle('win:fullscreenToggle', (e) => {
//   const win = BrowserWindow.fromWebContents(e.sender)
//   if (!win) return
//   if (win.isMaximized()) win.unmaximize()
//   else win.maximize()
// })

// /* ---------- Explicit dialogs: Open File / Open Folder ---------- */
// ipcMain.handle('dialog:chooseFile', async () => {
//   const ret = await dialog.showOpenDialog({
//     title: 'Open DICOM file',
//     buttonLabel: 'Open',
//     properties: ['openFile'],
//     filters: [
//       { name: 'DICOM', extensions: ['dcm', 'ima', 'dicom'] },
//       { name: 'All Files', extensions: ['*'] },
//     ],
//   })
//   if (ret.canceled || ret.filePaths.length === 0) return null
//   const p = ret.filePaths[0]
//   // If the selected path is a folder (unlikely here), treat accordingly
//   const isDir = (() => {
//     try { return fs.statSync(p).isDirectory() } catch { return false }
//   })()
//   return { path: p, kind: isDir ? 'directory' as const : 'file' as const }
// })

// ipcMain.handle('dialog:chooseDir', async () => {
//   const ret = await dialog.showOpenDialog({
//     title: 'Open DICOM folder',
//     buttonLabel: 'Open',
//     properties: ['openDirectory'],
//   })
//   if (ret.canceled || ret.filePaths.length === 0) return null
//   const p = ret.filePaths[0]
//   return { path: p, kind: 'directory' as const }
// })

// type ScanOptions = { ignorePrivate: boolean; ignoreBulk: boolean; redactPHI: boolean }

// /* ---------- Start scan (worker thread) ---------- */
// ipcMain.handle('scan:start', async (_evt, rootPath: string, options: ScanOptions) => {
//   const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
//   const worker = new Worker(path.join(__dirname, 'worker', 'scanWorker.js'), {
//     workerData: { jobId, rootPath, options },
//   })
//   worker.on('message', (msg) => mainWindow?.webContents.send(`scan:${msg.type}`, msg))
//   worker.on('error', (err) => mainWindow?.webContents.send('scan:error', { jobId, error: String(err) }))
//   return jobId
// })

// /* ---------- Single-file headers (worker) ---------- */
// ipcMain.handle('headers:get', async (_evt, filePath: string, options: ScanOptions) => {
//   return new Promise((resolve) => {
//     const jobId = `headers_${Date.now()}`
//     const worker = new Worker(path.join(__dirname, 'worker', 'scanWorker.js'), {
//       workerData: { jobId, singleFile: filePath, mode: 'headers', options },
//     })
//     worker.on('message', (msg) => {
//       if (msg?.type === 'headers') resolve(msg.headers)
//     })
//     worker.on('error', (err) => resolve({ error: String(err) }))
//     worker.on('exit', (code) => {
//       if (code !== 0) resolve({ error: `headers worker exited with code ${code}` })
//     })
//   })
// })

// /* ---------- Headers window: open a whole series as a tab ---------- */
// ipcMain.handle('headers:openSeries', async (_evt, payload: SeriesOpenPayload) => {
//   const firstPath = payload.instances?.[0]?.path
//   const tabKey = firstPath || (payload.title ?? `series_${Date.now()}`)
//   const enriched = { ...payload, tabKey, activate: true }
//   void sendOrQueueAddTab(enriched)  // use the fast path
//   return true

//   // const win = await ensureHeadersWindow()

//   // // Stable tab key for dedupe/focus (first instance path or title)
//   // const firstPath = payload.instances?.[0]?.path
//   // const tabKey = firstPath || (payload.title ?? `series_${Date.now()}`)

//   // headersQueue.push({ ...payload, tabKey, activate: true })
//   // flushIfFullyReady()

//   // win.show()
//   // win.focus()
//   // return true
// })

// /* ---------- Handshake from renderer to flush queued tabs ---------- */
// ipcMain.handle('headers:ping', () => {
//   headersRendererReady = true
//   flushIfFullyReady()
//   return true
// })

// /* Handle copy */
// ipcMain.handle('util:copyText', (_evt, text: string) => {
//   clipboard.writeText(String(text ?? ''))
//   return true
// })
