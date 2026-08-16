const SECRET_KEY = '(?:api[_-]?key|authorization|cookie|token|access[_-]?token|refresh[_-]?token)'

export function redactSecrets(input: string): string {
  let value = input
  value = value.replace(/(authorization\s*:\s*)(?:bearer|basic)\s+[^\s,;]+/giu, '$1[REDACTED]')
  value = value.replace(/(cookie\s*:\s*)[^\r\n]+/giu, '$1[REDACTED]')
  value = value.replace(new RegExp(`("?${SECRET_KEY}"?\\s*[:=]\\s*)(["']?)([^"'\\s,;}]+)`, 'giu'), '$1$2[REDACTED]')
  value = value.replace(/([?&](?:api[_-]?key|token|access_token|refresh_token)=)[^&#\s]+/giu, '$1[REDACTED]')
  value = value.replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, '[REDACTED_KEY]')
  return value
}

export function safeError(error: unknown): string {
  if (error instanceof Error) return redactSecrets(`${error.name}: ${error.message}`)
  return redactSecrets(String(error))
}
