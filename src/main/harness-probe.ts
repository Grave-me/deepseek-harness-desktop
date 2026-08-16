export interface HarnessProbe {
  reachable: boolean
  compatible: boolean
  reason: string
}

const MAX_PROBE_BYTES = 2 * 1024 * 1024

async function readLimited(response: Response): Promise<string> {
  if (response.body === null) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const part = await reader.read()
    if (part.done) break
    size += part.value.byteLength
    if (size > MAX_PROBE_BYTES) {
      await reader.cancel()
      throw new Error('probe response exceeds limit')
    }
    chunks.push(part.value)
  }
  return new TextDecoder().decode(Buffer.concat(chunks))
}

export async function probeHarness(url: string, timeoutMs = 2_000): Promise<HarnessProbe> {
  const controller = new AbortController()
  const timer = setTimeout(() => { controller.abort() }, timeoutMs)
  try {
    const response = await fetch(url, {
      method: 'GET', redirect: 'manual', cache: 'no-store', signal: controller.signal,
      headers: { accept: 'text/html', 'user-agent': 'DeepSeek-Harness-Desktop/0.1.0' },
    })
    if (response.status !== 200) return { reachable: true, compatible: false, reason: `HTTP ${response.status}` }
    const type = response.headers.get('content-type')?.toLowerCase() ?? ''
    if (!type.includes('text/html')) return { reachable: true, compatible: false, reason: `unexpected content-type ${type}` }
    const body = await readLimited(response)
    const compatible = body.includes('window.__DSH_BOOT__') && /deepseek harness/iu.test(body)
    return { reachable: true, compatible, reason: compatible ? 'DSH boot manifest found' : 'DSH fingerprint missing' }
  } catch (error) {
    return { reachable: false, compatible: false, reason: error instanceof Error ? error.message : String(error) }
  } finally {
    clearTimeout(timer)
  }
}
