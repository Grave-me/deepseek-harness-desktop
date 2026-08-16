import { spawn } from 'node:child_process'
import { connect } from 'node:net'
import { join } from 'node:path'

export interface TcpListener {
  address: string
  port: number
  pid: number
}

function splitEndpoint(endpoint: string): { address: string; port: number } | undefined {
  const match = /^(.*):(\d+)$/.exec(endpoint)
  if (match === null) return undefined
  const address = match[1]?.replace(/^\[|\]$/g, '')
  const port = Number(match[2])
  if (address === undefined || !Number.isInteger(port)) return undefined
  return { address, port }
}

export function parseNetstatListeners(output: string, port: number): TcpListener[] {
  const listeners: TcpListener[] = []
  for (const line of output.split(/\r?\n/u)) {
    const columns = line.trim().split(/\s+/u)
    if (columns[0]?.toUpperCase() !== 'TCP' || columns.length < 4) continue
    const local = splitEndpoint(columns[1] ?? '')
    const remote = splitEndpoint(columns[2] ?? '')
    const pid = Number(columns.at(-1))
    if (local?.port !== port || remote?.port !== 0 || !Number.isInteger(pid) || pid <= 0) continue
    listeners.push({ address: local.address, port: local.port, pid })
  }
  return listeners
}

export function isStrictIpv4Loopback(listeners: readonly TcpListener[]): boolean {
  return listeners.length > 0 && listeners.every(item => item.address === '127.0.0.1')
}

export async function inspectTcpListeners(port: number): Promise<TcpListener[]> {
  const systemRoot = process.env.SystemRoot ?? 'C:\\Windows'
  const executable = join(systemRoot, 'System32', 'netstat.exe')
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn(executable, ['-a', '-n', '-o', '-p', 'tcp'], {
      shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.once('error', reject)
    child.once('exit', code => code === 0 ? resolve(stdout) : reject(new Error(`netstat exited ${code}: ${stderr}`)))
  })
  return parseNetstatListeners(output, port)
}

export async function isTcpPortOpen(host: string, port: number, timeoutMs = 750): Promise<boolean> {
  return await new Promise(resolve => {
    const socket = connect({ host, port })
    const finish = (result: boolean): void => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(result)
    }
    socket.setTimeout(timeoutMs, () => { finish(false) })
    socket.once('connect', () => { finish(true) })
    socket.once('error', () => { finish(false) })
  })
}
