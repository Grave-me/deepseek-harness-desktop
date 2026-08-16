import assert from 'node:assert/strict'
import test from 'node:test'
import { redactSecrets } from '../src/main/redaction.js'

test('redacts common credentials without logging their values', () => {
  const input = 'Authorization: Bearer secret123 Cookie: sid=hidden token=abc api_key="xyz" https://x/?token=urlsecret sk-abcdefghijklmnop'
  const output = redactSecrets(input)
  for (const secret of ['secret123', 'sid=hidden', 'abc', 'xyz', 'urlsecret', 'sk-abcdefghijklmnop']) {
    assert.equal(output.includes(secret), false)
  }
  assert.match(output, /REDACTED/u)
})
