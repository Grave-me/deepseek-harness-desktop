import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  maximized: boolean
}

export interface AppConfig {
  minimizeToTray: boolean
  startWithWindows: boolean
  showOnStartup: boolean
  verboseLogging: boolean
  trayHintShown: boolean
  window: WindowState
}

export const DEFAULT_CONFIG: AppConfig = {
  minimizeToTray: true,
  startWithWindows: false,
  showOnStartup: true,
  verboseLogging: false,
  trayHintShown: false,
  window: { width: 1280, height: 820, maximized: false },
}

export class ConfigStore {
  readonly path: string
  private writeQueue: Promise<void> = Promise.resolve()
  constructor(directory: string) { this.path = join(directory, 'config.json') }

  async load(): Promise<AppConfig> {
    try {
      const parsed = JSON.parse(await readFile(this.path, 'utf8')) as Partial<AppConfig>
      return {
        ...DEFAULT_CONFIG,
        ...parsed,
        window: { ...DEFAULT_CONFIG.window, ...parsed.window },
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error
      return structuredClone(DEFAULT_CONFIG)
    }
  }

  async save(config: AppConfig): Promise<void> {
    const snapshot = structuredClone(config)
    const write = this.writeQueue.then(async () => {
      await mkdir(dirname(this.path), { recursive: true })
      const temporary = `${this.path}.${process.pid}.tmp`
      await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
      await rename(temporary, this.path)
    })
    this.writeQueue = write.catch(() => undefined)
    await write
  }
}
