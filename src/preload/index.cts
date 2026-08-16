import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopBridge, HarnessStatus } from '../shared/contracts.js'

const channels = {
  getStatus: 'desktop:get-status',
  retry: 'desktop:retry',
  openLogs: 'desktop:open-logs',
  quit: 'desktop:quit',
  statusChanged: 'desktop:status-changed',
} as const

if (globalThis.location.protocol === 'file:') {
  const bridge: DesktopBridge = {
    getStatus: async () => await ipcRenderer.invoke(channels.getStatus) as HarnessStatus,
    retry: async () => await ipcRenderer.invoke(channels.retry),
    openLogs: async () => await ipcRenderer.invoke(channels.openLogs),
    quit: async () => await ipcRenderer.invoke(channels.quit),
    onStatusChanged: listener => {
      const wrapped = (_event: Electron.IpcRendererEvent, status: HarnessStatus): void => { listener(status) }
      ipcRenderer.on(channels.statusChanged, wrapped)
      return () => { ipcRenderer.removeListener(channels.statusChanged, wrapped) }
    },
  }
  contextBridge.exposeInMainWorld('desktop', bridge)
}
