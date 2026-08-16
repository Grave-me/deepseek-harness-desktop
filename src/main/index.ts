import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Notification, screen, session, shell, Tray } from 'electron'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { ConfigStore, type AppConfig } from './app-config.js'
import { HarnessManager } from './harness-manager.js'
import { FileLogger } from './logger.js'
import { HARNESS_ORIGIN, isAllowedNavigation, isAllowedRendererRequest, isPermittedExternalUrl } from './navigation-policy.js'
import { IPC_CHANNELS, type HarnessStatus } from '../shared/contracts.js'

const APP_ID = 'com.yuwang.deepseek-harness-desktop'
const PRODUCT_NAME = 'DeepSeek Harness Desktop'
const moduleDirectory = fileURLToPath(new URL('.', import.meta.url))
const statusPage = resolve(moduleDirectory, '../renderer/status.html')
const statusPageUrl = pathToFileURL(statusPage).href

app.setAppUserModelId(APP_ID)
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  void runApplication().catch(error => {
    const message = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error)
    console.error(message)
    if (app.isReady()) dialog.showErrorBox('DeepSeek Harness Desktop 启动失败', message)
    app.exit(1)
  })
}

async function runApplication(): Promise<void> {
  const testRoot = !app.isPackaged && process.env.DSH_DESKTOP_TEST_PROFILE_ROOT !== undefined
    ? resolve(process.env.DSH_DESKTOP_TEST_PROFILE_ROOT)
    : undefined
  const appDataDirectory = testRoot === undefined ? join(app.getPath('appData'), PRODUCT_NAME) : join(testRoot, 'AppData')
  app.setPath('userData', appDataDirectory)
  await app.whenReady()

  const localRoot = testRoot === undefined ? process.env.LOCALAPPDATA ?? app.getPath('userData') : join(testRoot, 'LocalAppData')
  const logDirectory = join(localRoot, PRODUCT_NAME, 'logs')
  await mkdir(logDirectory, { recursive: true })
  const logger = new FileLogger(logDirectory)
  const configStore = new ConfigStore(appDataDirectory)
  let config = await configStore.load()
  let quitting = false
  let quitInProgress = false

  const runtimeRoot = app.isPackaged ? join(process.resourcesPath, 'runtime') : join(process.cwd(), 'build', 'runtime')
  const manager = new HarnessManager(
    join(runtimeRoot, 'node', 'node.exe'),
    join(runtimeRoot, 'sidecar'),
    logger,
    testRoot === undefined ? {} : { dshHome: join(testRoot, '.dsh') },
  )

  const preload = resolve(moduleDirectory, '../preload/index.cjs')
  const window = new BrowserWindow({
    title: PRODUCT_NAME,
    width: config.window.width,
    height: config.window.height,
    ...(isVisiblePosition(config) ? { x: config.window.x, y: config.window.y } : {}),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
    },
  })
  if (config.window.maximized) window.maximize()

  const showWindow = (): void => {
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  }

  app.on('second-instance', showWindow)
  app.on('activate', showWindow)

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isPermittedExternalUrl(url)) void confirmAndOpenExternal(window, url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (isAllowedNavigation(url, statusPageUrl)) return
    event.preventDefault()
    if (isPermittedExternalUrl(url)) void confirmAndOpenExternal(window, url)
  })
  window.webContents.on('will-redirect', (event, url) => {
    if (!isAllowedNavigation(url, statusPageUrl)) event.preventDefault()
  })
  session.defaultSession.on('will-download', event => { event.preventDefault() })
  session.defaultSession.setPermissionCheckHandler(() => false)
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => { callback(false) })
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (details, callback) => {
    callback({ cancel: !isAllowedRendererRequest(details.url) })
  })

  const saveWindowState = (): void => {
    if (window.isMinimized()) return
    const bounds = window.getNormalBounds()
    config = { ...config, window: { ...bounds, maximized: window.isMaximized() } }
    void configStore.save(config).catch(error => { logger.error('Could not save window state', error) })
  }
  window.on('resize', saveWindowState)
  window.on('move', saveWindowState)
  window.on('close', event => {
    if (quitting || !config.minimizeToTray) return
    event.preventDefault()
    window.hide()
    if (!config.trayHintShown) {
      config = { ...config, trayHintShown: true }
      void configStore.save(config)
      if (Notification.isSupported()) new Notification({ title: PRODUCT_NAME, body: '应用仍在系统托盘中运行；可从托盘菜单退出。' }).show()
    }
  })

  const trayIcon = nativeImage.createFromBuffer(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAADISURBVFhH7ZRBCoMwEEU9jlfyBD2Hi97Dhadw7Qk8gjt3BRFEKFNiDYR8207gqxTmw9vIT3yzyGT57SFXksUfzsYETOAfBCZpRZFhlgLO/oYn4JMowhdYs0gJ9+yTLgATjlIPYeFTbx+CwJuieYatNW2FvRiagKPswqJI34zQiaEK5NUSNr93N7gC91l6bXfDBKgC8BK6CToxRAHcB6c+Q5heuQ0JAji5i2Z6R7qAIpoF5KELaCf30ARSf+xRCByLCZiACVwu8ALPtukD+MhbiQAAAABJRU5ErkJggg==', 'base64'))
  const tray = new Tray(trayIcon.resize({ width: 16, height: 16 }))
  tray.setToolTip(PRODUCT_NAME)
  tray.on('double-click', showWindow)
  const rebuildTray = (): void => {
    const status = manager.getStatus()
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: window.isVisible() ? '隐藏主窗口' : '显示主窗口', click: () => window.isVisible() ? window.hide() : showWindow() },
      { label: '在默认浏览器中打开', enabled: status.phase === 'running', click: () => { void shell.openExternal(HARNESS_ORIGIN) } },
      { type: 'separator' },
      { label: '打开日志目录', click: () => { void shell.openPath(logDirectory) } },
      { label: '重启 Harness', enabled: status.ownership !== 'external', click: () => { void manager.restart() } },
      { type: 'separator' },
      {
        label: '关闭窗口时最小化到托盘', type: 'checkbox', checked: config.minimizeToTray,
        click: item => { config = { ...config, minimizeToTray: item.checked }; void configStore.save(config); rebuildTray() },
      },
      {
        label: '开机启动', type: 'checkbox', checked: config.startWithWindows,
        click: item => {
          config = { ...config, startWithWindows: item.checked }
          app.setLoginItemSettings({ openAtLogin: item.checked, path: process.execPath })
          void configStore.save(config)
          rebuildTray()
        },
      },
      { type: 'separator' },
      { label: '退出', click: () => { quitting = true; app.quit() } },
    ]))
  }

  const trustedIpcSender = (event: Electron.IpcMainInvokeEvent): boolean => event.sender === window.webContents && event.senderFrame?.url === statusPageUrl
  const requireTrustedSender = (event: Electron.IpcMainInvokeEvent): void => {
    if (!trustedIpcSender(event)) throw new Error('IPC sender is not permitted')
  }
  ipcMain.handle(IPC_CHANNELS.getStatus, event => { requireTrustedSender(event); return manager.getStatus() })
  ipcMain.handle(IPC_CHANNELS.retry, async event => { requireTrustedSender(event); await manager.restart() })
  ipcMain.handle(IPC_CHANNELS.openLogs, async event => { requireTrustedSender(event); await shell.openPath(logDirectory) })
  ipcMain.handle(IPC_CHANNELS.quit, event => { requireTrustedSender(event); quitting = true; app.quit() })

  const loadStatusPage = async (): Promise<void> => {
    if (window.webContents.getURL() !== statusPageUrl) await window.loadFile(statusPage)
  }
  manager.on('status', (status: HarnessStatus) => {
    rebuildTray()
    if (status.phase === 'running') {
      if (!window.webContents.getURL().startsWith(HARNESS_ORIGIN)) void window.loadURL(status.url ?? HARNESS_ORIGIN)
    } else {
      void loadStatusPage().then(() => { window.webContents.send(IPC_CHANNELS.statusChanged, status) })
    }
  })

  rebuildTray()
  await loadStatusPage()
  if (config.showOnStartup) showWindow()
  void manager.start()

  if (process.env.DSH_DESKTOP_SMOKE_QUIT_AFTER_MS !== undefined) {
    const delay = Number(process.env.DSH_DESKTOP_SMOKE_QUIT_AFTER_MS)
    if (Number.isInteger(delay) && delay >= 1_000 && delay <= 60_000) {
      setTimeout(() => { quitting = true; app.quit() }, delay)
    }
  }

  app.on('before-quit', event => {
    quitting = true
    if (quitInProgress) return
    event.preventDefault()
    quitInProgress = true
    void manager.stop().finally(async () => {
      await logger.flush()
      tray.destroy()
      app.quit()
    })
  })
}

async function confirmAndOpenExternal(parent: BrowserWindow, url: string): Promise<void> {
  const choice = await dialog.showMessageBox(parent, {
    type: 'question', buttons: ['取消', '打开'], defaultId: 0, cancelId: 0,
    title: '打开外部链接', message: '将在默认浏览器中打开外部网站。', detail: url,
  })
  if (choice.response === 1) await shell.openExternal(url)
}

function isVisiblePosition(config: AppConfig): config is AppConfig & { window: { x: number; y: number; width: number; height: number; maximized: boolean } } {
  const { x, y, width, height } = config.window
  if (x === undefined || y === undefined) return false
  return screen.getAllDisplays().some(display => {
    const area = display.workArea
    return x < area.x + area.width && x + width > area.x && y < area.y + area.height && y + height > area.y
  })
}
