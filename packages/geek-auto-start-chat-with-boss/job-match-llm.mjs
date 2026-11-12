import { completes } from '@geekgeekrun/utils/gpt-request.mjs'
import {
  buildJobMatchMessages,
  getBaseURLFromCompleteApiUrl,
  isJevDecisionConfig,
  isJevDecisionModel,
  parseJobMatchResponse,
  pickJobFilterLlmConfig,
  pickJobFilterPlanLlmConfig,
  pickJobMatchLlmConfig
} from './job-match-llm-parse.mjs'

export {
  buildJobMatchMessages,
  getBaseURLFromCompleteApiUrl,
  isJevDecisionConfig,
  isJevDecisionModel,
  parseJobMatchResponse,
  pickJobFilterLlmConfig,
  pickJobFilterPlanLlmConfig,
  pickJobMatchLlmConfig
}

export async function requestJobMatchScore({
  llmConfig,
  resumeText,
  job,
  deterministicScore = 0
}) {
  if (!llmConfig) {
    return null
  }
  const baseURL = getBaseURLFromCompleteApiUrl(llmConfig.providerCompleteApiUrl)
  if (!baseURL || !String(llmConfig.model ?? '').trim()) {
    return null
  }
  const completion = await completes(
    {
      baseURL,
      apiKey: llmConfig.providerApiSecret,
      model: llmConfig.model,
      headers: llmConfig.headers,
      apiMode: llmConfig.apiMode === 'responses' ? 'responses' : 'chat',
      maxOutputTokens: Math.min(
        Math.max(Number(llmConfig.maxOutputTokens) || 256, 128),
        512
      ),
      temperature: 0.1,
      reasoningEffort: llmConfig.reasoningEffort,
      reasoningSupported: llmConfig.reasoningSupported,
      jsonMode: true
    },
    buildJobMatchMessages({
      resumeText,
      job,
      deterministicScore
    })
  )
  return parseJobMatchResponse(completion?.content)
}
