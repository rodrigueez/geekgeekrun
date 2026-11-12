import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeJobSourceList } from '../packages/geek-auto-start-chat-with-boss/job-source.mjs'

test('normalizes enabled job sources and deduplicates them', () => {
  assert.deepEqual(
    normalizeJobSourceList([
      { type: 'expect', enabled: true },
      { type: 'expect', enabled: true },
      {
        type: 'search',
        enabled: true,
        children: [
          { enabled: true, keyword: ' Node.js ' },
          { enabled: true, keyword: 'Node.js' },
          { enabled: false, keyword: 'Vue' }
        ]
      },
      { type: 'recommend', enabled: false }
    ]),
    [
      { type: 'expect' },
      { type: 'search', keyword: 'Node.js' }
    ]
  )
  assert.deepEqual(normalizeJobSourceList([]), [{ type: 'expect' }])
})
