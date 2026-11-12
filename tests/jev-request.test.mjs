import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildJevSemanticFilterQuestions,
  parseJevSemanticFilterResponse,
  requestJevSystemOne,
  resolveJevSystemOneUrl
} from '../packages/geek-auto-start-chat-with-boss/jev-request.mjs'
import {
  isJevDecisionConfig,
  isJevDecisionModel,
  pickJobFilterLlmConfig,
  pickJobMatchLlmConfig
} from '../packages/geek-auto-start-chat-with-boss/job-match-llm-parse.mjs'
import { buildFallbackJobFilterPlan } from '../packages/geek-auto-start-chat-with-boss/job-filter-agent-parse.mjs'

test('resolves the System One endpoint from official and gateway URLs', () => {
  assert.equal(
    resolveJevSystemOneUrl('https://jev-ai.org'),
    'https://jev-ai.org/api/v1/systemone/'
  )
  assert.equal(
    resolveJevSystemOneUrl('https://jev-ai.org/api/v1'),
    'https://jev-ai.org/api/v1/systemone/'
  )
  assert.equal(
    resolveJevSystemOneUrl('http://127.0.0.1:3425/v1'),
    'http://127.0.0.1:3425/v1/systemone'
  )
  assert.equal(
    resolveJevSystemOneUrl('http://127.0.0.1:3425/v1/systemone/'),
    'http://127.0.0.1:3425/v1/systemone'
  )
  assert.equal(
    resolveJevSystemOneUrl('https://openrouter.ai/api'),
    'https://openrouter.ai/api/v1/systemone/'
  )
  assert.equal(
    resolveJevSystemOneUrl('https://example.com/custom', '/v1/systemone/'),
    'https://example.com/v1/systemone/'
  )
})

test('builds and sends a native Jev decision request', async () => {
  let captured
  const response = await requestJevSystemOne({
    llmConfig: {
      providerCompleteApiUrl: 'https://jev-ai.org/api/v1',
      providerApiSecret: 'secret',
      model: 'jev-1.13'
    },
    state: '职位详情',
    questions: {
      job_fit: {
        type: 'noul',
        instructions: '是否符合要求？'
      }
    },
    fetchImpl: async (url, init) => {
      captured = { url, init }
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'req-1' },
        text: async () =>
          JSON.stringify({
            model: 'jev-1.13',
            model_version: 'jev-1.13-20260917',
            answers: {
              job_fit: { type: 'noul', noul: 0.7 }
            }
          })
      }
    }
  })

  assert.equal(captured.url, 'https://jev-ai.org/api/v1/systemone/')
  assert.equal(captured.init.method, 'POST')
  assert.equal(captured.init.headers.Authorization, 'Bearer secret')
  const requestBody = JSON.parse(captured.init.body)
  assert.deepEqual(requestBody, {
    state: '职位详情',
    questions: {
      job_fit: {
        type: 'noul',
        instructions: '是否符合要求？'
      }
    },
    model: 'jev-1.13'
  })
  assert.equal(response.answers.job_fit.noul, 0.7)
})

test('maps Jev probabilities to the existing semantic filter result', () => {
  const rejected = parseJevSemanticFilterResponse({
    model: 'jev-1.13',
    model_version: 'jev-1.13-20260917',
    answers: {
      job_fit: { type: 'noul', noul: 0.08 },
      hard_conflict: { type: 'noul', noul: 0.92 }
    }
  })
  assert.equal(rejected.match, false)
  assert.equal(rejected.confidence, 0.84)
  assert.equal(rejected.constraints.source, 'jev')
  assert.match(rejected.reasons.join(' '), /0\.92/)

  const uncertain = parseJevSemanticFilterResponse({
    answers: {
      job_fit: { type: 'boolean', probability: 0.5 },
      hard_conflict: { type: 'boolean', probability: 0.5 }
    }
  })
  assert.equal(uncertain.match, true)
  assert.equal(uncertain.confidence, 0)
})

test('builds safe Jev questions and a deterministic fallback plan', () => {
  const questions = buildJevSemanticFilterQuestions()
  assert.equal(questions.job_fit.type, 'noul')
  assert.equal(questions.hard_conflict.type, 'noul')
  assert.ok(questions.job_fit.instructions.length <= 1000)

  const plan = buildFallbackJobFilterPlan(
    '找兼职线上 SEO 工作，不要全职、坐班或需要到岗的职位'
  )
  assert.deepEqual(plan.employmentTypes, ['兼职'])
  assert.deepEqual(plan.workModes, ['线上'])
  assert.ok(plan.mustNotHave.includes('全职'))
  assert.ok(plan.mustNotHave.includes('坐班'))
  assert.ok(plan.mustNotHave.includes('到岗'))

  const commaSeparated = buildFallbackJobFilterPlan(
    '不要全职，找线上兼职 SEO，不要坐班'
  )
  assert.deepEqual(commaSeparated.employmentTypes, ['兼职'])
  assert.deepEqual(commaSeparated.workModes, ['线上'])
  assert.deepEqual(commaSeparated.mustNotHave, ['全职', '坐班'])
})

test('keeps decision and generation models on separate task paths', () => {
  const decisionConfig = {
    enabled: true,
    providerCompleteApiUrl: 'https://jev-ai.org/api/v1',
    providerApiSecret: 'secret',
    model: 'jev-1.13',
    apiMode: 'decision',
    serveWeight: 100
  }
  const chatConfig = {
    enabled: true,
    providerCompleteApiUrl: 'https://api.deepseek.com',
    providerApiSecret: 'secret',
    model: 'deepseek-flash',
    apiMode: 'chat',
    serveWeight: 100
  }
  assert.equal(isJevDecisionModel('jev-1.13'), true)
  assert.equal(isJevDecisionModel('typesafe/jev-1.13'), true)
  assert.equal(isJevDecisionModel('commandcode-plan/typesafe/jev'), true)
  assert.equal(isJevDecisionModel('typesafe/jev-router'), false)
  assert.equal(isJevDecisionConfig(decisionConfig), true)
  assert.equal(
    isJevDecisionConfig({ ...decisionConfig, apiMode: 'chat' }),
    false
  )
  assert.equal(
    isJevDecisionConfig({ ...decisionConfig, apiMode: undefined }),
    true
  )
  assert.equal(pickJobMatchLlmConfig([decisionConfig, chatConfig]).model, 'deepseek-flash')
  assert.equal(pickJobFilterLlmConfig([chatConfig, decisionConfig]).model, 'jev-1.13')
  assert.equal(
    isJevDecisionConfig({
      enabled: true,
      providerCompleteApiUrl: 'http://127.0.0.1:3425/v1',
      model: 'commandcode-plan/typesafe/jev'
    }),
    true
  )
})
