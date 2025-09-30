import * as dotenv from 'dotenv'
dotenv.config()

import { app, BrowserWindow, dialog, ipcMain, globalShortcut } from 'electron'
import * as path from 'node:path'
import { Worker } from 'node:worker_threads'

let mainWindow: BrowserWindow | null = null
let headersWindow: BrowserWindow | null = null

let headersWindowLoaded = false;
let headersRendererReady = false;

let headersReady = false

type SeriesOpenPayload = {
  seriesKey: string
  title: string
  instances: { path: string; sop?: string; instanceNumber?: number; date?: string; time?: string }[]
}

const headersQueue: SeriesOpenPayload[] = []
const DEV_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'

function sendAddTab(p: SeriesOpenPayload) {
  if (!headersWindow || headersWindow.isDestroyed()) return
  // headersWindow.webContents.send('headers:add-tab', payload)
  headersWindow.webContents.send('headers:add-tab', p)
  headersWindow.show()
  headersWindow.focus()
}


function flushIfFullyReady() {
  if (!headersWindow || headersWindow.isDestroyed()) return;
  if (!headersWindowLoaded || !headersRendererReady) return;
  const q = headersQueue.splice(0, headersQueue.length);
  for (const p of q) sendAddTab(p);
}


function createWindow() {
  console.log('[main] createWindow() DEV_URL=', DEV_URL)
  mainWindow = new BrowserWindow({
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
    console.log('[main] loading main window URL:', DEV_URL)
    mainWindow.loadURL(DEV_URL)
  } else {
    const file = path.join(process.cwd(), 'dist', 'index.html')
    console.log('[main] loading main window file:', file)
    mainWindow.loadFile(path.join(process.cwd(), 'dist', 'index.html'))
  }


  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[main] mainWindow did-finish-load url=', mainWindow?.webContents.getURL())
  })

  mainWindow.once('ready-to-show', () => {
    console.log('[main] mainWindow ready-to-show -> fullscreen+show')
    mainWindow!.maximize()
    mainWindow!.show()
  })

  mainWindow.on('closed', () => { console.log('[main] mainWindow closed'); mainWindow = null })
}

function ensureHeadersWindow() {
  if (headersWindow && !headersWindow.isDestroyed()) return headersWindow

  headersReady = false
  // headersQueue = []
  headersWindowLoaded = false;
  headersRendererReady = false;

  console.log('[main] ensureHeadersWindow(): creating new headers window')
  headersWindow = new BrowserWindow({
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

  const isDev = process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL
  if (isDev) {
    const url = `${DEV_URL.replace(/\/?$/, '/') }#/headers`
    console.log('[main] headersWindow.loadURL', url)
    headersWindow.loadURL(url)
  } else {
    const file = path.join(process.cwd(), 'dist', 'index.html')
    console.log('[main] headersWindow.loadFile', file, 'with hash=/headers')
    headersWindow.loadFile(file, { hash: '/headers' })
  }


  headersWindow.webContents.on('did-finish-load', () => {
    console.log('[main] headersWindow did-finish-load url=', headersWindow?.webContents.getURL())
    // auto-open DevTools to see renderer logs immediately
    // headersWindow!.webContents.openDevTools({ mode: 'detach' })
    headersWindowLoaded = true;
    // headersReady = true;
    // flushHeadersQueue();
  })


  headersWindow.once('ready-to-show', () => { 
    console.log('[main] headersWindow ready-to-show')
    headersWindow!.maximize()
    headersWindow!.show() 
    headersWindow!.focus()
  })

  headersWindow.on('closed', () => { 
    console.log('[main] headersWindow closed')
    headersWindow = null
    headersReady = false; //headersQueue = []
  })
  return headersWindow
}




app.whenReady().then(() => {
  console.log('[main] app.whenReady()')
  createWindow()

  globalShortcut.register('F11', () => {
    console.log('[main] F11 toggled')
    const wins = [mainWindow, headersWindow].filter(Boolean) as BrowserWindow[]
    for (const win of wins) {
      if (win.isMaximized()) win.unmaximize() 
      else win.maximize()
    }

  })

  app.on('activate', () => {
    console.log('[main] app.active')
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  console.log('[main] window-all-closed')
  if (process.platform !== 'darwin') app.quit()
})
app.on('will-quit', () => { console.log('[main] will-quit (unregister shortcuts)');globalShortcut.unregisterAll()})

/* ---------- Window control IPC ---------- */
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

/* ---------- Folder picker ---------- */
ipcMain.handle('dialog:chooseDir', async () => {
  console.log('[main] dialog:chooseDir invoked')
  const ret = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory'] })
  if (ret.canceled || ret.filePaths.length === 0) return null
  console.log('[main] dialog:chooseDir ->', ret.filePaths[0])
  return ret.filePaths[0]
})

type ScanOptions = { ignorePrivate: boolean; ignoreBulk: boolean; redactPHI: boolean }

/* ---------- Start scan (worker thread) ---------- */
ipcMain.handle('scan:start', async (_evt, rootPath: string, options: ScanOptions) => {
  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const worker = new Worker(path.join(__dirname, 'worker', 'scanWorker.js'), {
    workerData: { jobId, rootPath, options },
  })
  worker.on('message', (msg) => mainWindow?.webContents.send(`scan:${msg.type}`, msg))
  worker.on('error', (err) => mainWindow?.webContents.send('scan:error', { jobId, error: String(err) }))
  return jobId
})

/* ---------- Single-file headers (worker) ---------- */
ipcMain.handle('headers:get', async (_evt, filePath: string, options: ScanOptions) => {
  return new Promise((resolve) => {
    const jobId = `headers_${Date.now()}`;
    const worker = new Worker(path.join(__dirname, 'worker', 'scanWorker.js'), {
      workerData: { jobId, singleFile: filePath, mode: 'headers', options },
    });
    worker.on('message', (msg) => {
      if (msg?.type === 'headers') resolve(msg.headers);
    });
    worker.on('error', (err) => resolve({ error: String(err) }));
    worker.on('exit', (code) => {
      if (code !== 0) {
        resolve({ error: `headers worker exited with code ${code}` });
      }
    });
  });
});


ipcMain.handle('headers:openSeries', async (_evt, payload: SeriesOpenPayload) => {
  const win = ensureHeadersWindow()
  // queue it (renderer will focus if already open)
  headersQueue.push(payload)
  flushIfFullyReady()

  // Use a stable key (e.g., first instance path) to deduplicate
  const firstPath = payload.instances?.[0]?.path
  const tabKey = firstPath || (payload.title ?? `series_${Date.now()}`)
  win.webContents.send('headers:add-tab', { ...payload, tabKey })
  return true
})

// Handle "ping" from renderer to flush late
ipcMain.handle('headers:ping', () => {
  headersRendererReady = true;
  flushIfFullyReady();
  return true;
})


