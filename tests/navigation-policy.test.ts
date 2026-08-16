import assert from 'node:assert/strict'
import test from 'node:test'
import { isAllowedNavigation, isAllowedRendererRequest, isPermittedExternalUrl } from '../src/main/navigation-policy.js'

const status = 'file:///C:/app/status.html'

test('only exact loopback Harness origin and local status page navigate in-app', () => {
  assert.equal(isAllowedNavigation(status, status), true)
  assert.equal(isAllowedNavigation('http://127.0.0.1:3080/chat?id=1', status), true)
  for (const url of [
    'http://localhost:3080/', 'http://0.0.0.0:3080/', 'http://127.0.0.1:3081/',
    'https://127.0.0.1:3080/', 'http://user@127.0.0.1:3080/', 'file:///C:/other.html',
  ]) assert.equal(isAllowedNavigation(url, status), false, url)
})

test('external opening accepts HTTPS only', () => {
  assert.equal(isPermittedExternalUrl('https://example.com/path'), true)
  assert.equal(isPermittedExternalUrl('http://example.com'), false)
  assert.equal(isPermittedExternalUrl('javascript:alert(1)'), false)
})

test('renderer network is limited to loopback HTTP and WebSocket', () => {
  assert.equal(isAllowedRendererRequest('http://127.0.0.1:3080/api'), true)
  assert.equal(isAllowedRendererRequest('ws://127.0.0.1:3080/socket'), true)
  assert.equal(isAllowedRendererRequest('https://127.0.0.1:3080/api'), false)
  assert.equal(isAllowedRendererRequest('wss://example.com/socket'), false)
})
