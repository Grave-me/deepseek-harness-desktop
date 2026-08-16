export const HARNESS_ORIGIN = 'http://127.0.0.1:3080'

export function isAllowedNavigation(rawUrl: string, statusPageUrl: string): boolean {
  if (rawUrl === statusPageUrl) return true
  try {
    const url = new URL(rawUrl)
    return url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.port === '3080' && url.username === '' && url.password === ''
  } catch { return false }
}

export function isPermittedExternalUrl(rawUrl: string): boolean {
  try { return new URL(rawUrl).protocol === 'https:' } catch { return false }
}

export function isAllowedRendererRequest(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    return ['http:', 'ws:'].includes(url.protocol) && url.hostname === '127.0.0.1' && url.port === '3080' && url.username === '' && url.password === ''
  } catch { return false }
}
