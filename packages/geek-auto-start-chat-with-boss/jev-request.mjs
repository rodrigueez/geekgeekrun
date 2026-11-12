import {
  buildJobSemanticFilterState
} from './job-filter-agent-parse.mjs'

const DEFAULT_TIMEOUT_MS = 20_000
const DEFAULT_SYSTEMONE_PATH = '/api/v1/systemone'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeHeaders(headers) {
  if (!headers) {
    return {}
  }
  const parsed =
    typeof headers === 'string' ? JSON.parse(headers) : headers
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('自定义请求头必须是 JSON 对象')
  }
  return Object.fromEntries(
    Object.entries(parsed)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)])
  )
}

function hasHeader(headers, name) {
  return Object.keys(headers).some(
    (key) => key.toLowerCase() === name.toLowerCase()
  )
}

function joinUrlPath(base, path) {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

function setSystemOnePath(url, path) {
  const normalizedPath = path.replace(/\/+$/, '')
  const isLocalGateway = ['localhost', '127.0.0.1', '::1'].includes(
    url.hostname
  )
  url.pathname = isLocalGateway ? normalizedPath : `${normalizedPath}/`
  return url.toString()
}

export function resolveJevSystemOneUrl(baseURL, decisionApiPath = '') {
  const raw = normalizeText(baseURL)
  if (!raw) {
    throw new Error('Jev Base URL 不能为空')
  }
  let url
  try {
    url = new URL(raw)
  } catch {
    throw new Error('Jev Base URL 格式无效')
  }

  const explicitPath = normalizeText(decisionApiPath)
  if (/^https?:\/\//i.test(explicitPath)) {
    return explicitPath
  }
  if (/\/systemone\/?$/i.test(url.pathname)) {
    return setSystemOnePath(url, url.pathname)
  }
  if (explicitPath) {
    return setSystemOnePath(
      url,
      explicitPath.startsWith('/')
        ? explicitPath
        : joinUrlPath(url.pathname, explicitPath)
    )
  }

  const pathname = url.pathname.replace(/\/+$/, '')
  if (/\/v1$/i.test(pathname)) {
    return setSystemOnePath(url, `${pathname}/systemone`)
  }
  if (/\/api\/v1$/i.test(pathname)) {
    return setSystemOnePath(url, `${pathname}/systemone`)
  }
  if (/\/api$/i.test(pathname)) {
    return setSystemOnePath(url, `${pathname}/v1/systemone`)
  }
  if (/\/typesafe\/v1$/i.test(pathname)) {
    return setSystemOnePath(url, `${pathname}/systemone`)
  }
  if (/\/typesafe$/i.test(pathname)) {
    return setSystemOnePath(url, `${pathname}/v1/systemone`)
  }
  if (url.hostname.endsWith('ai-gateway.vercel.sh')) {
    return setSystemOnePath(url, '/typesafe/v1/systemone')
  }
  if (!pathname) {
    return setSystemOnePath(url, DEFAULT_SYSTEMONE_PATH)
  }
  return setSystemOnePath(url, `${pathname}${DEFAULT_SYSTEMONE_PATH}`)
}

export class JevRequestError extends Error {
  constructor(message, { status, code, detail, requestId } = {}) {
    super(message)
    this.name = 'JevRequestError'
    this.status = status ?? null
    this.code = code ?? null
    this.detail = detail ?? null
    this.requestId = requestId ?? null
  }
}

export async function requestJevSystemOne({
  llmConfig,
  state,
  questions,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
}) {
  const endpoint = resolveJevSystemOneUrl(
    llmConfig?.providerCompleteApiUrl,
    llmConfig?.decisionApiPath
  )
  const headers = normalizeHeaders(llmConfig?.headers)
  const apiKey = normalizeText(llmConfig?.providerApiSecret)
  if (apiKey && !hasHeader(headers, 'authorization')) {
    headers.Authorization = `Bearer ${apiKey}`
  }
  headers['Content-Type'] = 'application/json'
  headers.Accept = 'application/json'

  const body = {
    state,
    questions
  }
  const model = normalizeText(llmConfig?.model)
  if (model) {
    body.model = model
  }

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  })
  const responseText = await response.text()
  let responseBody = null
  try {
    responseBody = responseText ? JSON.parse(responseText) : null
  } catch {
    responseBody = null
  }
  if (!response.ok) {
    const error = responseBody?.error
    throw new JevRequestError(
      `Jev 请求失败：HTTP ${response.status}${
        error?.message ? ` ${error.message}` : ''
      }`,
      {
        status: response.status,
        code: error?.code,
        detail: error?.detail,
        requestId:
          response.headers.get('x-request-id') ??
          responseBody?.request_id ??
          null
      }
    )
  }
  if (!responseBody || typeof responseBody !== 'object') {
    throw new JevRequestError('Jev 接口没有返回合法 JSON')
  }
  return responseBody
}

export function buildJevSemanticFilterQuestions() {
  return {
    job_fit: {
      type: 'noul',
      instructions:
        '根据 state 中的用户目标、硬性条件和职位信息，判断这个职位是否应该继续沟通。只有职位信息与用户要求明显相容时才回答是；信息不足时不要仅凭职位名称猜测。'
    },
    hard_conflict: {
      type: 'noul',
      instructions:
        '判断职位是否明确违反 state 中用户的任一硬性条件。例如用户要求兼职但职位明确写全职，或用户要求线上但职位明确要求坐班、到岗。只有明确证据才回答是。'
    }
  }
}

function getNoulProbability(answer) {
  const value = answer?.noul ?? answer?.probability
  const probability = Number(value)
  return Number.isFinite(probability)
    ? Math.min(Math.max(probability, 0), 1)
    : null
}

function formatProbability(value) {
  return Number(value).toFixed(2)
}

export function parseJevSemanticFilterResponse(response) {
  const answers = response?.answers
  if (!answers || typeof answers !== 'object') {
    throw new Error('Jev 响应缺少 answers')
  }
  const fitProbability = getNoulProbability(answers.job_fit)
  const hardConflictProbability = getNoulProbability(answers.hard_conflict)
  if (fitProbability === null && hardConflictProbability === null) {
    throw new Error('Jev 响应缺少职位匹配结果')
  }

  const fit = fitProbability ?? 0.5
  const conflict = hardConflictProbability ?? 0.5
  const negativeProbability = Math.max(1 - fit, conflict)
  const match = negativeProbability <= 0.5
  const confidence =
    Math.round(
      Math.min(
        Math.max(Math.abs(negativeProbability - 0.5) * 2, 0),
        1
      ) * 1000
    ) / 1000

  const reasons = []
  if (1 - fit >= 0.5) {
    reasons.push(`Jev 判断职位匹配概率为 ${formatProbability(fit)}`)
  }
  if (conflict >= 0.5) {
    reasons.push(
      `Jev 判断硬性条件冲突概率为 ${formatProbability(conflict)}`
    )
  }
  if (!reasons.length) {
    reasons.push(`Jev 判断职位匹配概率为 ${formatProbability(fit)}`)
  }

  return {
    match,
    confidence,
    reasons: reasons.slice(0, 3),
    constraints: {
      source: 'jev',
      fitProbability: fit,
      hardConflictProbability: conflict,
      model: response?.model ?? null,
      modelVersion: response?.model_version ?? null
    }
  }
}

export async function requestJevSemanticFilter({
  llmConfig,
  criteria,
  plan,
  job,
  stage,
  fetchImpl = fetch
}) {
  if (
    !normalizeText(llmConfig?.providerCompleteApiUrl) ||
    !normalizeText(llmConfig?.model)
  ) {
    return null
  }
  const response = await requestJevSystemOne({
    llmConfig,
    state: buildJobSemanticFilterState({
      criteria,
      plan,
      job,
      stage
    }),
    questions: buildJevSemanticFilterQuestions(),
    fetchImpl
  })
  return parseJevSemanticFilterResponse(response)
}
