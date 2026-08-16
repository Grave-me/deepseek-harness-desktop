import assert from 'node:assert/strict'
import test from 'node:test'
import { isStrictIpv4Loopback, parseNetstatListeners } from '../src/main/network.js'

test('parses Windows netstat listeners independently of localized state labels', () => {
  const output = [
    ' TCP    127.0.0.1:3080       0.0.0.0:0       LISTENING       1234',
    ' TCP    0.0.0.0:3080         0.0.0.0:0       ABHÖREN         5678',
    ' TCP    127.0.0.1:9999       0.0.0.0:0       LISTENING       1',
  ].join('\r\n')
  const listeners = parseNetstatListeners(output, 3080)
  assert.deepEqual(listeners, [
    { address: '127.0.0.1', port: 3080, pid: 1234 },
    { address: '0.0.0.0', port: 3080, pid: 5678 },
  ])
  assert.equal(isStrictIpv4Loopback(listeners), false)
  assert.equal(isStrictIpv4Loopback([listeners[0]!]), true)
  assert.equal(isStrictIpv4Loopback([]), false)
})
