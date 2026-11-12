import { completes } from '@geekgeekrun/utils/gpt-request.mjs'
import {
  getBaseURLFromCompleteApiUrl,
  isJevDecisionConfig
} from './job-match-llm-parse.mjs'
import { requestJevSemanticFilter } from './jev-request.mjs'
import {
  buildJobFilterPlanMessages,
  buildJobSemanticFilterMessages,
  parseJobFilterPlan,
  parseJobSemanticFilterResult
} from './job-filter-agent-parse.mjs'

function getCompletionOptions(llmConfig, maxOutputTokens) {
  return {
    baseURL: getBaseURLFromCompleteApiUrl(llmConfig.providerCompleteApiUrl),
    apiKey: llmConfig.providerApiSecret,
    model: llmConfig.model,
    headers: llmConfig.headers,
    apiMode: llmConfig.apiMode === 'responses' ? 'responses' : 'chat',
    maxOutputTokens,
    temperature: 0.1,
    reasoningEffort: llmConfig.reasoningEffort,
    reasoningSupported: llmConfig.reasoningSupported,
    jsonMode: true
  }
}

function hasUsableConfig(llmConfig) {
  return Boolean(
    llmConfig &&
    getBaseURLFromCompleteApiUrl(llmConfig.providerCompleteApiUrl) &&
    String(llmConfig.model ?? '').trim()
  )
}

export async function requestJobFilterPlan({ llmConfig, criteria }) {
  if (!hasUsableConfig(llmConfig) || isJevDecisionConfig(llmConfig)) {
    return null
  }
  const completion = await completes(
    getCompletionOptions(llmConfig, 512),
    buildJobFilterPlanMessages(criteria)
  )
  return parseJobFilterPlan(completion?.content)
}

export async function requestJobSemanticFilter({
  llmConfig,
  criteria,
  plan,
  job,
  stage
}) {
  if (!hasUsableConfig(llmConfig)) {
    return null
  }
  if (isJevDecisionConfig(llmConfig)) {
    return await requestJevSemanticFilter({
      llmConfig,
      criteria,
      plan,
      job,
      stage
    })
  }
  const completion = await completes(
    getCompletionOptions(llmConfig, 384),
    buildJobSemanticFilterMessages({
      criteria,
      plan,
      job,
      stage
    })
  )
  return parseJobSemanticFilterResult(completion?.content)
}
