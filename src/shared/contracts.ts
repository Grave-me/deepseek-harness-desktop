export type HarnessPhase =
  | 'idle'
  | 'probing'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'error'
  | 'security-error'

export interface HarnessStatus {
  phase: HarnessPhase
  message: string
  url?: string
  ownership: 'none' | 'owned' | 'external'
  errorCode?: string
}

export const IPC_CHANNELS = {
  getStatus: 'desktop:get-status',
  retry: 'desktop:retry',
  openLogs: 'desktop:open-logs',
  quit: 'desktop:quit',
  statusChanged: 'desktop:status-changed',
} as const

export interface DesktopBridge {
  getStatus(): Promise<HarnessStatus>
  retry(): Promise<void>
  openLogs(): Promise<void>
  quit(): Promise<void>
  onStatusChanged(listener: (status: HarnessStatus) => void): () => void
}
