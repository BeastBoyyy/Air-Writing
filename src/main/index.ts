import { app, BrowserWindow, dialog, globalShortcut, ipcMain, protocol, screen, systemPreferences } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'

// The packaged renderer is served from app://bundle/ instead of file:// so that
// fetch(), WASM streaming compile and workers all behave like a normal web origin.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
])

const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.wasm': 'application/wasm', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.task': 'application/octet-stream'
}

let win: BrowserWindow | null = null
let overlay = false
let savedBounds: Electron.Rectangle | null = null

function createWindow(): void {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: false,
    transparent: true, // needed for overlay mode; the page paints its own background otherwise
    backgroundColor: '#00000000',
    hasShadow: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      backgroundThrottling: false, // keep the render loop and tracking at full rate
      contextIsolation: true
    }
  })

  win.webContents.session.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'media'))
  win.webContents.session.setPermissionCheckHandler((_wc, permission) => permission === 'media')

  win.once('ready-to-show', () => {
    win?.maximize()
    win?.show()
  })
  win.on('maximize', () => win?.webContents.send('win:state', { maximized: true }))
  win.on('unmaximize', () => win?.webContents.send('win:state', { maximized: false }))

  if (process.env.ELECTRON_RENDERER_URL) {
    // dev: mirror renderer console into the terminal
    win.webContents.on('console-message', (e) => console.log(`[renderer:${e.level}] ${e.message}`))
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else win.loadURL('app://bundle/index.html')
}

function setOverlay(on: boolean): void {
  if (!win || on === overlay) return
  overlay = on
  if (on) {
    savedBounds = win.getBounds()
    const display = screen.getDisplayMatching(savedBounds)
    win.setAlwaysOnTop(true, 'screen-saver')
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    win.setBounds(display.bounds)
    win.setIgnoreMouseEvents(true, { forward: true })
  } else {
    win.setIgnoreMouseEvents(false)
    win.setAlwaysOnTop(false)
    win.setVisibleOnAllWorkspaces(false)
    if (savedBounds) win.setBounds(savedBounds)
    win.maximize()
  }
  win.webContents.send('overlay', overlay)
}

app.whenReady().then(async () => {
  const root = normalize(join(__dirname, '../renderer'))
  protocol.handle('app', async (req) => {
    const file = normalize(join(root, decodeURIComponent(new URL(req.url).pathname)))
    if (!file.startsWith(root + sep)) return new Response('Forbidden', { status: 403 })
    try {
      const data = await readFile(file)
      return new Response(data, { headers: { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' } })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })

  if (process.platform === 'darwin') await systemPreferences.askForMediaAccess('camera').catch(() => false)

  ipcMain.handle('file:save', async (_e, opts: { name: string; filters: Electron.FileFilter[]; data: string | ArrayBuffer }) => {
    if (!win) return null
    const res = await dialog.showSaveDialog(win, { defaultPath: opts.name, filters: opts.filters })
    if (res.canceled || !res.filePath) return null
    await writeFile(res.filePath, typeof opts.data === 'string' ? opts.data : Buffer.from(opts.data))
    return res.filePath
  })
  ipcMain.handle('file:open', async (_e, filters: Electron.FileFilter[]) => {
    if (!win) return null
    const res = await dialog.showOpenDialog(win, { filters, properties: ['openFile'] })
    if (res.canceled || !res.filePaths[0]) return null
    return readFile(res.filePaths[0], 'utf8')
  })
  ipcMain.on('win', (_e, action: string) => {
    if (!win) return
    if (action === 'minimize') win.minimize()
    else if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize()
    else if (action === 'fullscreen') win.setFullScreen(!win.isFullScreen())
    else if (action === 'close') win.close()
    else if (action === 'overlay') setOverlay(!overlay)
  })

  createWindow()
  globalShortcut.register('CommandOrControl+Shift+A', () => setOverlay(!overlay))

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => globalShortcut.unregisterAll())
app.on('window-all-closed', () => app.quit())
