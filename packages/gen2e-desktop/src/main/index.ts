import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { tasksInterpreter } from '@rhighs/gen2e-interpreter'
import { makeLogger, Gen2ELoggerTagColor, Gen2ELoggerRuntimeCallInfo } from '@rhighs/gen2e-logger'
import util from 'util'

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 1280,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

type TasksInterpreter = any
let interpreter: TasksInterpreter | undefined

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  ipcMain.handle('stop-interpreter', async (_event, ..._args) => {
    if (interpreter) {
      await interpreter.teardown()
    }
  })

  const customLogger = makeLogger(
    'GEN2E-DESKTOP',
    (
      tag: string,
      _tagColor: Gen2ELoggerTagColor,
      rinfo: Gen2ELoggerRuntimeCallInfo,
      ...args: any[]
    ) => {
      return `[${tag.toUpperCase()}]${
        rinfo.file !== '' ? ` ${rinfo.file}:${rinfo.line}:${rinfo.col}` : ''
      } ${args
        .map((arg) =>
          typeof arg === 'object' ? util.inspect(arg, { depth: Infinity, colors: false }) : arg
        )
        .join(' ')}`
    },
    (s) => {
      win.webContents.send('gen2e-log', {
        file: '',
        message: s
      })
    }
  )
  ipcMain.handle('interpret', async (_event, ...args) => {
    if (interpreter) {
      await interpreter.teardown()
    }

    const [model, mode, tasks] = args
    interpreter = tasksInterpreter(
      {
        mode: mode?.length ? mode : undefined,
        logger: customLogger
      },
      {
        model: model?.length ? model : 'gpt-4o',
        policies: {
          screenshot: 'model',
          visualDebugLevel: 'medium',
          maxRetries: 2
        },
        debug: true
      }
    )

    const result = await interpreter.run(tasks)
    return result.result
  })

  const win = createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
