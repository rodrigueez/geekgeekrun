import assert from 'node:assert/strict'
import test from 'node:test'
import { getJobListSkipReason } from '../packages/geek-auto-start-chat-with-boss/job-list-prefilter.mjs'

const MARK_AS_NOT_SUIT_ON_BOSS = 1
const MARK_AS_NOT_SUIT_ON_LOCAL = 2
const NO_OP = 3

const baseJob = {
  encryptJobId: 'job-1',
  encryptBossId: 'boss-1',
  cityName: '广州',
  jobExperience: '3-5年',
  salaryDesc: '20-30K',
  brandName: 'Example Ltd'
}

test('skips a job when a no-op filter does not match', () => {
  assert.equal(
    getJobListSkipReason(baseJob, {
      expectCityList: ['深圳'],
      expectCityNotMatchStrategy: NO_OP
    }),
    'CITY_NOT_SUIT'
  )
  assert.equal(
    getJobListSkipReason(baseJob, {
      expectWorkExpList: ['1-3年'],
      expectWorkExpNotMatchStrategy: NO_OP
    }),
    'WORK_EXP_NOT_SUIT'
  )
  assert.equal(
    getJobListSkipReason(baseJob, {
      isSalaryFilterEnabled: true,
      isSalarySuit: () => false,
      expectSalaryNotMatchStrategy: NO_OP
    }),
    'SALARY_NOT_SUIT'
  )
})

test('does not skip a mismatched job when it still needs to be marked', () => {
  assert.equal(
    getJobListSkipReason(baseJob, {
      expectCityList: ['深圳'],
      expectCityNotMatchStrategy: MARK_AS_NOT_SUIT_ON_LOCAL
    }),
    null
  )
  assert.equal(
    getJobListSkipReason(baseJob, {
      isSalaryFilterEnabled: true,
      isSalarySuit: () => false,
      expectSalaryNotMatchStrategy: MARK_AS_NOT_SUIT_ON_BOSS
    }),
    null
  )
})

test('skips blocked companies, unavailable jobs and already chatted bosses', () => {
  assert.equal(
    getJobListSkipReason(baseJob, {
      companyAllowList: ['Another Company']
    }),
    'COMPANY_NOT_IN_ALLOW_LIST'
  )
  assert.equal(
    getJobListSkipReason(baseJob, {
      blockJobNotHiring: new Set([baseJob.encryptJobId])
    }),
    'JOB_NOT_HIRING'
  )
  assert.equal(
    getJobListSkipReason(baseJob, {
      blockBossNotNewChat: new Set([baseJob.encryptBossId])
    }),
    'BOSS_ALREADY_CHATTED'
  )
})

test('skips unparseable salary and blocked company names', () => {
  assert.equal(
    getJobListSkipReason(baseJob, {
      isSalaryParseable: () => false
    }),
    'SALARY_UNPARSEABLE'
  )
  assert.equal(
    getJobListSkipReason(baseJob, {
      blockCompanyNameRegExp: /Example/i,
      blockCompanyNameRegMatchStrategy: NO_OP
    }),
    'COMPANY_BLOCKED'
  )
})

test('skips jobs already processed in a recent run', () => {
  assert.equal(
    getJobListSkipReason(baseJob, {
      processedJobIds: new Set([baseJob.encryptJobId])
    }),
    'PROCESSED_RECENTLY'
  )
})
