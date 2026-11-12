import assert from 'node:assert/strict'
import test from 'node:test'

import {
  JOB_CANDIDATE_STATUS,
  buildJobCandidateRecord,
  isCandidateChattable,
  summarizeCandidateForList
} from '../packages/geek-auto-start-chat-with-boss/job-candidate.mjs'

const baseJobInfo = {
  encryptId: 'job-1',
  encryptUserId: 'boss-1'
}

const baseListJob = {
  jobName: 'SEO 内容兼职',
  brandName: '示例公司',
  salaryDesc: '20-50元/时',
  cityName: '远程',
  jobType: 6,
  daysPerWeekDesc: '3天/周',
  skills: ['SEO', '英文写作', '内容运营'],
  jobLabels: ['经验不限', '大专'],
  description: '这段不应进入列表快照'
}

test('builds a candidate record from list and detail data', () => {
  const record = buildJobCandidateRecord({
    encryptCurrentUserId: 'me',
    profileId: 'profile-1',
    jobInfo: baseJobInfo,
    listJob: baseListJob,
    matchScore: 72.6,
    reasons: ['技能关键词匹配'],
    components: { title: 0.8, skills: 0.6 },
    sourceKey: 'expect:SEO',
    searchKeyword: 'SEO',
    filterConditionKey: 'fc-1'
  })

  assert.equal(record.encryptJobId, 'job-1')
  assert.equal(record.status, JOB_CANDIDATE_STATUS.CANDIDATE)
  assert.equal(record.matchScore, 73)
  assert.equal(record.profileId, 'profile-1')

  const reason = JSON.parse(record.reasonJson)
  assert.deepEqual(reason.reasons, ['技能关键词匹配'])
  assert.equal(reason.components.skills, 0.6)

  const snapshot = JSON.parse(record.jobSnapshotJson)
  assert.equal(snapshot.jobName, 'SEO 内容兼职')
  assert.equal(snapshot.jobType, 6)
  assert.equal(snapshot.description, undefined)
  assert.deepEqual(snapshot.skills, ['SEO', '英文写作', '内容运营'])
})

test('requires identity fields', () => {
  assert.throws(() => buildJobCandidateRecord({ jobInfo: baseJobInfo, listJob: baseListJob }))
  assert.throws(() =>
    buildJobCandidateRecord({ encryptCurrentUserId: 'me', jobInfo: {}, listJob: {} })
  )
})

test('only queued candidates can start a chat', () => {
  assert.equal(isCandidateChattable(JOB_CANDIDATE_STATUS.QUEUED), true)
  assert.equal(isCandidateChattable(JOB_CANDIDATE_STATUS.CANDIDATE), false)
  assert.equal(isCandidateChattable(JOB_CANDIDATE_STATUS.CHATTED), false)
})

test('records why a job was rejected so the list can show everything', () => {
  const record = buildJobCandidateRecord({
    encryptCurrentUserId: 'me',
    jobInfo: baseJobInfo,
    listJob: baseListJob,
    matchScore: 35,
    decision: 'rejected:low-score',
    reasons: ['薪资低于期望']
  })
  const summary = summarizeCandidateForList({ ...record, id: 11 })
  assert.equal(summary.decision, 'rejected:low-score')
  assert.deepEqual(summary.reasons, ['薪资低于期望'])
})

test('summarizes a stored record for list rendering', () => {
  const record = buildJobCandidateRecord({
    encryptCurrentUserId: 'me',
    jobInfo: baseJobInfo,
    listJob: baseListJob,
    matchScore: 88,
    reasons: ['标题匹配']
  })
  const summary = summarizeCandidateForList({ ...record, id: 3 })
  assert.equal(summary.id, 3)
  assert.equal(summary.jobName, 'SEO 内容兼职')
  assert.equal(summary.matchScore, 88)
  assert.deepEqual(summary.reasons, ['标题匹配'])
})
