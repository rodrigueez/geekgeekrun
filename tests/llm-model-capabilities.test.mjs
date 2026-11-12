import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizeModelListItem,
  shouldSendReasoningEffort
} from '../packages/utils/llm-model-capabilities.mjs'

test('normalizes provider reasoning levels and output limits', () => {
  const model = normalizeModelListItem({
    id: 'provider/reasoning-model',
    reasoning: true,
    reasoning_levels: ['none', 'low', 'high', 'max'],
    supported_reasoning_levels: [
      { effort: 'none' },
      { effort: 'low' },
      { effort: 'high' },
      { effort: 'max' }
    ],
    default_parameters: {
      reasoning_effort: 'high',
      max_output_tokens: 4096
    },
    max_output_tokens: 200000,
    max_input_tokens: 1000000,
    context_window: 1000000,
    supported_parameters: ['reasoning', 'tools']
  })

  assert.deepEqual(model.reasoningLevels, ['none', 'low', 'high', 'max'])
  assert.equal(model.defaultReasoningEffort, 'high')
  assert.equal(model.maxOutputTokens, 200000)
  assert.equal(model.defaultMaxOutputTokens, 4096)
  assert.equal(model.maxInputTokens, 1000000)
  assert.equal(model.contextLength, 1000000)
  assert.deepEqual(model.supportedParameters, ['reasoning', 'tools'])
})

test('keeps models without capability metadata usable with null limits', () => {
  const model = normalizeModelListItem({
    id: 'legacy/model'
  })
  assert.deepEqual(model.reasoningLevels, [])
  assert.equal(model.reasoning, null)
  assert.equal(model.maxOutputTokens, null)
  assert.equal(model.defaultMaxOutputTokens, null)
})

test('uses provider reasoning capability instead of model-name guessing', () => {
  assert.equal(
    shouldSendReasoningEffort({
      model: 'provider/custom-reasoner',
      reasoningSupported: true
    }),
    true
  )
  assert.equal(
    shouldSendReasoningEffort({
      model: 'gpt-6-astra',
      reasoningSupported: false
    }),
    false
  )
  assert.equal(
    shouldSendReasoningEffort({
      model: 'gpt-6-astra'
    }),
    true
  )
})
