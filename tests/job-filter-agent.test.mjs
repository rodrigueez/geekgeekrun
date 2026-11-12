import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildJobSemanticFilterMessages,
  evaluatePlanHardReject,
  getCriteriaHash,
  getJobSemanticInputHash,
  parseJobFilterPlan,
  parseJobSemanticFilterResult
} from '../packages/geek-auto-start-chat-with-boss/job-filter-agent-parse.mjs'

const criteria = '找兼职线上 SEO 工作，不要全职、坐班或需要到岗的职位'

test('builds stable criteria and job input hashes', () => {
  assert.equal(getCriteriaHash(criteria), getCriteriaHash(`  ${criteria}  `))
  assert.notEqual(getCriteriaHash(criteria), getCriteriaHash('找全职工作'))
  assert.equal(
    getJobSemanticInputHash({ jobName: 'SEO' }, 'list'),
    getJobSemanticInputHash({ jobName: 'SEO' }, 'list')
  )
})

test('parses a structured filter plan', () => {
  const plan = parseJobFilterPlan(
    '```json\n{"roleKeywords":["SEO"],"employmentTypes":["兼职"],"workModes":["线上"],"mustNotHave":["全职","坐班"],"summary":"兼职线上 SEO"}\n```'
  )
  assert.deepEqual(plan.roleKeywords, ['SEO'])
  assert.deepEqual(plan.employmentTypes, ['兼职'])
  assert.deepEqual(plan.workModes, ['线上'])
  assert.deepEqual(plan.mustNotHave, ['全职', '坐班'])
})

test('parses semantic filter confidence and result', () => {
  assert.deepEqual(
    parseJobSemanticFilterResult(
      '{"match":false,"confidence":0.82,"reasons":["明确要求全职坐班"]}'
    ),
    {
      match: false,
      confidence: 0.82,
      reasons: ['明确要求全职坐班'],
      constraints: {}
    }
  )
  assert.equal(
    parseJobSemanticFilterResult('{"match":true,"confidence":3}').confidence,
    1
  )
})

test('hard-rejects obvious title or skill contradictions', () => {
  const plan = {
    employmentTypes: ['兼职'],
    workModes: ['线上'],
    mustNotHave: ['坐班']
  }
  assert.equal(
    evaluatePlanHardReject(
      {
        jobName: '全职 SEO 专员',
        showSkills: ['坐班']
      },
      plan
    ).reject,
    true
  )
  assert.equal(
    evaluatePlanHardReject(
      {
        jobName: 'SEO 兼职',
        showSkills: ['远程']
      },
      plan
    ).reject,
    false
  )
  assert.equal(
    evaluatePlanHardReject(
      {
        jobName: '全职/兼职 SEO（可远程）'
      },
      plan
    ).reject,
    false
  )
})

test('includes stage and job description in semantic prompt', () => {
  const messages = buildJobSemanticFilterMessages({
    criteria,
    plan: { employmentTypes: ['兼职'] },
    job: {
      jobName: 'SEO',
      postDescription: '需要每周到岗五天'
    },
    stage: 'detail'
  })
  assert.match(messages[1].content, /每周到岗五天/)
  assert.match(messages[1].content, /detail/)
})
