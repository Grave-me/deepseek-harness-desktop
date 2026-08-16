import { appendFile, mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { redactSecrets, safeError } from './redaction.js'

export interface Logger {
  info(message: string): void
  warn(message: string): void
  error(message: string, error?: unknown): void
}

export interface FileLoggerOptions {
  maxBytes?: number
  retentionDays?: number
  maxTotalBytes?: number
  now?: () => Date
}

export class FileLogger implements Logger {
  readonly filePath: string
  private writeQueue = Promise.resolve()
  private readonly maxBytes: number
  private readonly retentionDays: number
  private readonly maxTotalBytes: number
  private readonly now: () => Date

  constructor(private readonly directory: string, options: FileLoggerOptions = {}) {
    this.filePath = join(directory, 'desktop.log')
    this.maxBytes = options.maxBytes ?? 10 * 1024 * 1024
    this.retentionDays = options.retentionDays ?? 30
    this.maxTotalBytes = options.maxTotalBytes ?? 200 * 1024 * 1024
    this.now = options.now ?? (() => new Date())
  }

  info(message: string): void { this.enqueue('INFO', message) }
  warn(message: string): void { this.enqueue('WARN', message) }
  error(message: string, error?: unknown): void {
    this.enqueue('ERROR', error === undefined ? message : `${message}: ${safeError(error)}`)
  }

  async flush(): Promise<void> { await this.writeQueue }

  private enqueue(level: string, message: string): void {
    const line = `${this.now().toISOString()} ${level} ${redactSecrets(message).replace(/[\r\n]+/g, ' ')}\n`
    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(this.directory, { recursive: true })
      await this.rotateIfNeeded(Buffer.byteLength(line))
      await appendFile(this.filePath, line, { encoding: 'utf8', mode: 0o600 })
    }).catch(() => undefined)
  }

  private async rotateIfNeeded(nextBytes: number): Promise<void> {
    try {
      const current = await stat(this.filePath)
      if (current.size + nextBytes >= this.maxBytes) {
        const suffix = this.now().toISOString().replaceAll(':', '-').replaceAll('.', '-')
        await rename(this.filePath, join(this.directory, `desktop-${suffix}.log`))
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    await this.prune()
  }

  private async prune(): Promise<void> {
    const entries = await readdir(this.directory, { withFileTypes: true })
    const files = []
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.log')) continue
      const path = join(this.directory, entry.name)
      const details = await stat(path)
      files.push({ path, mtimeMs: details.mtimeMs, size: details.size })
    }
    files.sort((a, b) => b.mtimeMs - a.mtimeMs)
    const cutoff = this.now().getTime() - this.retentionDays * 86_400_000
    let total = 0
    for (const file of files) {
      total += file.size
      if (file.mtimeMs < cutoff || total > this.maxTotalBytes) await rm(file.path, { force: true })
    }
  }
}

export class MemoryLogger implements Logger {
  readonly entries: string[] = []
  info(message: string): void { this.entries.push(`INFO ${redactSecrets(message)}`) }
  warn(message: string): void { this.entries.push(`WARN ${redactSecrets(message)}`) }
  error(message: string, error?: unknown): void {
    this.entries.push(`ERROR ${redactSecrets(error === undefined ? message : `${message}: ${safeError(error)}`)}`)
  }
}
