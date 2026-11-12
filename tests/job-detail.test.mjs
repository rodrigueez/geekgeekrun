import assert from 'node:assert/strict'
import test from 'node:test'
import { testIfJobTitleOrDescriptionSuit } from '../packages/geek-auto-start-chat-with-boss/job-detail.mjs'

const MATCH_LOGIC_EVERY = 1
const MATCH_LOGIC_SOME = 2

const jobInfo = {
  jobName: '高级前端工程师',
  positionName: '前端开发',
  postDescription: '负责 Vue 和 TypeScript 项目'
}

test('matches job detail fields with every or some logic', () => {
  const regexps = {
    expectJobNameRegExpStr: '前端',
    expectJobTypeRegExpStr: '后端',
    expectJobDescRegExpStr: 'Vue'
  }
  assert.equal(
    testIfJobTitleOrDescriptionSuit(
      jobInfo,
      MATCH_LOGIC_EVERY,
      regexps
    ),
    false
  )
  assert.equal(
    testIfJobTitleOrDescriptionSuit(
      jobInfo,
      MATCH_LOGIC_SOME,
      regexps
    ),
    true
  )
})

test('returns true when no detail regexp is configured', () => {
  assert.equal(
    testIfJobTitleOrDescriptionSuit(jobInfo, MATCH_LOGIC_EVERY),
    true
  )
})
