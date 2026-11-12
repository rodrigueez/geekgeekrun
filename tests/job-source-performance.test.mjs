import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildPerformanceMaps,
  sortFiltersByPerformance,
  sortSourcesByPerformance
} from '../packages/geek-auto-start-chat-with-boss/job-source-performance.mjs'

test('aggregates source and filter conversion rates', () => {
  const maps = buildPerformanceMaps(
    [
      { sourceKey: 'expect:0', filterConditionKey: 'a', views: 10, chats: 4, replies: 2, interviews: 1 },
      { sourceKey: 'expect:0', filterConditionKey: 'b', views: 5, chats: 2, replies: 0, interviews: 0 }
    ],
    { minChats: 3 }
  )
  const source = maps.bySource.get('expect:0')
  assert.equal(source.views, 15)
  assert.equal(source.chats, 6)
  assert.equal(source.replies, 2)
  assert.equal(source.isReliable, true)
  assert.equal(maps.byFilter.get('expect:0::a').chats, 4)
})

test('sorts only reliable sources by performance', () => {
  const maps = buildPerformanceMaps(
    [
      { sourceKey: 'reliable-good', views: 20, chats: 12, replies: 8, interviews: 2 },
      { sourceKey: 'reliable-bad', views: 20, chats: 12, replies: 0, interviews: 0 },
      { sourceKey: 'new-source', views: 2, chats: 1, replies: 1, interviews: 0 }
    ],
    { minChats: 10 }
  )
  const sources = [
    { sourceKey: 'new-source' },
    { sourceKey: 'reliable-bad' },
    { sourceKey: 'reliable-good' }
  ]
  assert.deepEqual(
    sortSourcesByPerformance(sources, maps).map((item) => item.sourceKey),
    ['new-source', 'reliable-good', 'reliable-bad']
  )
})

test('sorts filters within the current source', () => {
  const maps = buildPerformanceMaps(
    [
      { sourceKey: 'search:a', filterConditionKey: 'good', views: 10, chats: 10, replies: 8, interviews: 1 },
      { sourceKey: 'search:a', filterConditionKey: 'bad', views: 10, chats: 10, replies: 0, interviews: 0 }
    ],
    { minChats: 5 }
  )
  const filters = [
    { cityList: ['bad'] },
    { cityList: ['good'] }
  ]
  assert.deepEqual(
    sortFiltersByPerformance(
      filters,
      'search:a',
      maps,
      (filter) => filter.cityList[0]
    ).map((filter) => filter.cityList[0]),
    ['good', 'bad']
  )
})
