import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getBaseURLFromCompleteApiUrl,
  parseJobMatchResponse,
  pickJobMatchLlmConfig
} from '../packages/geek-auto-start-chat-with-boss/job-match-llm-parse.mjs'

test('derives the OpenAI-compatible base URL from a complete endpoint', () => {
  assert.equal(
    getBaseURLFromCompleteApiUrl('http://127.0.0.1:3425/v1/chat/completions'),
    'http://127.0.0.1:3425/v1'
  )
  assert.equal(
    getBaseURLFromCompleteApiUrl('https://api.example.com/v1'),
    'https://api.example.com/v1'
  )
})

test('parses plain and fenced JSON model responses', () => {
  assert.deepEqual(parseJobMatchResponse('{"score": 82, "reasons": ["技能匹配"]}'), {
    score: 82,
    reasons: ['技能匹配']
  })
  assert.deepEqual(
    parseJobMatchResponse('```json\n{"score": 120, "reasons": ["ok"]}\n```'),
    {
      score: 100,
      reasons: ['ok']
    }
  )
  assert.throws(() => parseJobMatchResponse('not json'), /合法 JSON/)
})

test('picks only enabled and complete LLM configs', () => {
  const config = pickJobMatchLlmConfig([
    {
      enabled: false,
      providerCompleteApiUrl: 'http://127.0.0.1:3425/v1/chat/completions',
      model: 'local-model'
    },
    {
      enabled: true,
      providerCompleteApiUrl: '',
      model: 'missing-url'
    },
    {
      enabled: true,
      providerCompleteApiUrl: 'http://127.0.0.1:3425/v1/chat/completions',
      model: 'local-model'
    }
  ])
  assert.equal(config.model, 'local-model')
  assert.equal(pickJobMatchLlmConfig([]), null)
})
