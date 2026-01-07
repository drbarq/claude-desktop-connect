import { app, shell, BrowserWindow, ipcMain, nativeTheme } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDatabase, getDatabase } from './database'
import { registerIpcHandlers } from './ipc-handlers'
import { createTray } from './tray'
import { createMenu } from './menu'
import { mcpManager } from './mcp'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1A1A1A' : '#FAFAFA',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Load the renderer
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Open devtools in development
  if (is.dev) {
    mainWindow.webContents.openDevTools()
  }
}

app.whenReady().then(() => {
  // Set app user model id for Windows
  electronApp.setAppUserModelId('com.claude-desktop')

  // Watch for shortcut events
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Initialize database
  initDatabase()

  // Register IPC handlers
  registerIpcHandlers()

  // Initialize MCP servers (async, don't block startup)
  mcpManager.connectAll().then(() => {
    console.log('MCP servers initialized:', mcpManager.getConnectedServers())
  }).catch((err) => {
    console.error('Failed to initialize MCP servers:', err)
  })

  // Create the main window
  createWindow()

  // Create system tray
  createTray(mainWindow!)

  // Create application menu
  createMenu()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Clean up MCP connections on quit
app.on('before-quit', async () => {
  await mcpManager.disconnectAll()
})

// Handle dark mode changes
nativeTheme.on('updated', () => {
  mainWindow?.webContents.send('theme:changed', nativeTheme.shouldUseDarkColors)
})

// Export for IPC handlers
export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}
