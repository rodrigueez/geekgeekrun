import assert from 'node:assert/strict'
import test from 'node:test'
import { findConditionByStrategy } from '../packages/geek-auto-start-chat-with-boss/not-suit-strategy.mjs'

test('finds the first reason that uses a strategy', () => {
  const reasons = {
    city: 3,
    jobDetail: 1,
    salary: 2
  }
  assert.equal(findConditionByStrategy(reasons, 1), 'jobDetail')
  assert.equal(findConditionByStrategy(reasons, 2), 'salary')
  assert.equal(findConditionByStrategy(reasons, 99), undefined)
})
