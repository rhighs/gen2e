import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const gen2e = {
  interpret: (...args: any[]) => ipcRenderer.invoke('interpret', ...args),
  stopInterpreter: (...args: any[]) => ipcRenderer.invoke('stop-interpreter', ...args),
  onLog: (cb: (...args: any[]) => void) =>
    ipcRenderer.on('gen2e-log', (_event, ...args: any[]) => cb(...args))
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    // expose gen2e interface
    contextBridge.exposeInMainWorld('gen2e', gen2e)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.gen2e = gen2e
}
