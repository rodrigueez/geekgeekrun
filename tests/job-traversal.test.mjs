import assert from 'node:assert/strict'
import test from 'node:test'
import {
  findCheckpointBySourceKey,
  getJobSourceKey,
  rotateListToKey
} from '../packages/geek-auto-start-chat-with-boss/job-traversal.mjs'

test('builds stable source keys for expect, search and recommend sources', () => {
  assert.equal(getJobSourceKey({ type: 'expect', index: 2 }), 'expect:2')
  assert.equal(
    getJobSourceKey({ type: 'search', keyword: '  Node.js  ' }),
    'search:Node.js'
  )
  assert.equal(getJobSourceKey({ type: 'recommend' }), 'recommend')
})

test('rotates a source list so the checkpoint source is processed first', () => {
  const list = [
    { sourceKey: 'expect:0' },
    { sourceKey: 'search:Node.js' },
    { sourceKey: 'recommend' }
  ]
  assert.deepEqual(
    rotateListToKey(list, 'search:Node.js', (item) => item.sourceKey),
    [
      { sourceKey: 'search:Node.js' },
      { sourceKey: 'recommend' },
      { sourceKey: 'expect:0' }
    ]
  )
  assert.equal(rotateListToKey(list, null, (item) => item.sourceKey), list)
})

test('finds the checkpoint belonging to a source', () => {
  const checkpoints = [
    { sourceKey: 'expect:0', filterConditionKey: 'a' },
    { sourceKey: 'search:Node.js', filterConditionKey: 'b' }
  ]
  assert.deepEqual(
    findCheckpointBySourceKey(checkpoints, 'search:Node.js'),
    { sourceKey: 'search:Node.js', filterConditionKey: 'b' }
  )
  assert.equal(findCheckpointBySourceKey(checkpoints, 'recommend'), null)
})
