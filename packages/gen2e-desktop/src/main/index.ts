import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { tasksInterpreter } from '@rhighs/gen2e-interpreter'
import { Writable } from 'stream'

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

type ProcessWriteType = typeof process.stdout.write & typeof process.stderr.write

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

  ipcMain.handle('interpret', async (_event, ...args) => {
    if (interpreter) {
      await interpreter.teardown()
    }

    const [model, mode, tasks] = args
    interpreter = tasksInterpreter(
      {
        mode: mode?.length ? mode : undefined
      },
      {
        model: model?.length ? model : undefined
      }
    )

    const result = await interpreter.run(tasks)
    return result.result
  })

  const win = createWindow()
  const interceptBufferWrite = (file: 'stdout' | 'stderr') => (buffer: string | Uint8Array) => {
    const message = buffer
    win.webContents.send('gen2e-log', {
      file,
      message
    })
  }

  const wrappedProcessWrite = (
    originalCall: ProcessWriteType,
    onWrite: (buffer: string | Uint8Array) => void
  ): ProcessWriteType => {
    return function (...args: any[]): ReturnType<InstanceType<typeof Writable>['write']> {
      const [buffer, encoding_cb, cb] = args
      onWrite(buffer)

      // overloads dispatch
      if (typeof encoding_cb === 'function') {
        return originalCall(buffer, encoding_cb)
      } else {
        return originalCall(buffer, encoding_cb, cb)
      }
    }
  }

  process.stdout.write = wrappedProcessWrite(
    process.stdout.write.bind(process.stdout),
    interceptBufferWrite('stdout')
  )
  process.stderr.write = wrappedProcessWrite(
    process.stderr.write.bind(process.stderr),
    interceptBufferWrite('stderr')
  )

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
