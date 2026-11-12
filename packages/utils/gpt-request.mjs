import OpenAI from "openai";
import {
  isReasoningModel,
  normalizeModelListItem,
  shouldSendReasoningEffort
} from "./llm-model-capabilities.mjs";
export {
  normalizeModelListItem,
  shouldSendReasoningEffort
} from "./llm-model-capabilities.mjs";

const DEFAULT_MAX_OUTPUT_TOKENS = 1024;
const DEFAULT_TIMEOUT_MS = 120_000;
const MODEL_LIST_TIMEOUT_MS = 15_000;
const capabilityCache = new Map();

function normalizeBaseURL(baseURL) {
  return String(baseURL ?? "").trim().replace(/\/+$/, "");
}

function resolveModelListURL({ baseURL, apiMode, decisionApiPath }) {
  const normalizedBaseURL = normalizeBaseURL(baseURL);
  if (apiMode !== "decision") {
    return `${normalizedBaseURL}/models`;
  }
  const url = new URL(normalizedBaseURL);
  const explicitPath = String(decisionApiPath ?? "").trim();
  if (/^https?:\/\//i.test(explicitPath)) {
    return explicitPath.replace(/\/systemone\/?$/i, "/models");
  }
  if (explicitPath) {
    url.pathname = explicitPath.startsWith("/")
      ? explicitPath
      : `${url.pathname.replace(/\/+$/, "")}/${explicitPath}`;
    return url.toString().replace(/\/systemone\/?$/i, "/models");
  }
  if (/\/systemone\/?$/i.test(url.pathname)) {
    url.pathname = url.pathname.replace(/\/systemone\/?$/i, "/models");
    return url.toString();
  }
  if (/\/models\/?$/i.test(url.pathname)) {
    return url.toString();
  }
  if (/\/api\/v1$/i.test(url.pathname)) {
    url.pathname = `${url.pathname}/models`;
    return url.toString();
  }
  if (/\/v1$/i.test(url.pathname)) {
    url.pathname = `${url.pathname}/models`;
    return url.toString();
  }
  if (/\/api$/i.test(url.pathname)) {
    url.pathname = `${url.pathname}/v1/models`;
    return url.toString();
  }
  if (/\/typesafe\/v1$/i.test(url.pathname)) {
    url.pathname = `${url.pathname}/models`;
    return url.toString();
  }
  if (/\/typesafe$/i.test(url.pathname)) {
    url.pathname = `${url.pathname}/v1/models`;
    return url.toString();
  }
  if (!url.pathname.replace(/\/+$/, "")) {
    url.pathname = "/api/v1/models/";
    return url.toString();
  }
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/api/v1/models/`;
  return url.toString();
}

function normalizeHeaders(headers) {
  if (!headers) {
    return {};
  }
  if (typeof headers === "string") {
    const text = headers.trim();
    return text ? normalizeHeaders(JSON.parse(text)) : {};
  }
  if (typeof headers !== "object" || Array.isArray(headers)) {
    throw new Error("自定义请求头必须是 JSON 对象");
  }
  return Object.fromEntries(
    Object.entries(headers)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)])
  );
}

function hasAuthorizationHeader(headers) {
  return Object.keys(headers).some((key) => key.toLowerCase() === "authorization");
}

function createClient({ baseURL, apiKey, headers }) {
  const normalizedHeaders = normalizeHeaders(headers);
  const normalizedBaseURL = normalizeBaseURL(baseURL);
  if (!normalizedBaseURL) {
    throw new Error("Base URL 不能为空");
  }
  return new OpenAI({
    baseURL: normalizedBaseURL,
    apiKey:
      String(apiKey ?? "").trim() ||
      (hasAuthorizationHeader(normalizedHeaders) ? "custom-header" : "local-gateway"),
    defaultHeaders: normalizedHeaders,
    timeout: DEFAULT_TIMEOUT_MS,
    maxRetries: 1
  });
}

function isGpt6Model(model) {
  return /gpt-6/i.test(String(model ?? ""));
}

function getEffectiveReasoningEffort(model, reasoningEffort) {
  if (reasoningEffort === "none" && isGpt6Model(model)) {
    return "low";
  }
  return reasoningEffort;
}

function isOpenAIEndpoint(baseURL) {
  try {
    return new URL(normalizeBaseURL(baseURL)).hostname.endsWith("openai.com");
  } catch {
    return false;
  }
}

function isDeepSeekEndpoint(baseURL) {
  try {
    return new URL(normalizeBaseURL(baseURL)).hostname.endsWith("deepseek.com");
  } catch {
    return false;
  }
}

function shouldUseMaxCompletionTokens({ baseURL, model }) {
  return isOpenAIEndpoint(baseURL) || isReasoningModel(model);
}

function getMaxOutputTokens(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : DEFAULT_MAX_OUTPUT_TOKENS;
}

function getCapabilityCacheKey({
  baseURL,
  model,
  reasoningEffort,
  reasoningSupported,
  jsonMode,
  maxOutputTokens,
  temperature
}) {
  return JSON.stringify([
    normalizeBaseURL(baseURL),
    String(model ?? ""),
    reasoningEffort ?? "default",
    reasoningSupported ?? "auto",
    Boolean(jsonMode),
    getMaxOutputTokens(maxOutputTokens),
    Number(temperature)
  ]);
}

function isUnsupportedParameterError(error) {
  if (error?.status !== 400) {
    return false;
  }
  return /unsupported|not supported|unknown (parameter|field)|unrecognized|invalid.*(temperature|max_tokens|max_completion_tokens|response_format|reasoning_effort|reasoning|thinking)/i.test(
    String(error?.message ?? "")
  );
}

function normalizeContent(content) {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        return part?.text ?? "";
      })
      .join("");
  }
  return "";
}

function normalizeChatCompletion(completion) {
  const choice = completion?.choices?.[0];
  const usage = completion?.usage ?? {};
  const promptTokens = usage.prompt_tokens ?? null;
  const cachedTokens =
    usage.prompt_tokens_details?.cached_tokens ??
    usage.prompt_cache_hit_tokens ??
    null;
  return {
    content: normalizeContent(choice?.message?.content),
    reasoningContent: choice?.message?.reasoning_content ?? null,
    finishReason: choice?.finish_reason ?? null,
    usage: {
      promptTokens,
      completionTokens: usage.completion_tokens ?? null,
      totalTokens: usage.total_tokens ?? null,
      reasoningTokens:
        usage.completion_tokens_details?.reasoning_tokens ??
        usage.reasoning_tokens ??
        null,
      cachedTokens
    },
    raw: completion
  };
}

function getResponsesOutputText(response) {
  if (typeof response?.output_text === "string") {
    return response.output_text;
  }
  return (response?.output ?? [])
    .flatMap((item) => item?.content ?? [])
    .filter((part) => part?.type === "output_text")
    .map((part) => part?.text ?? "")
    .join("");
}

function normalizeResponsesCompletion(response) {
  const usage = response?.usage ?? {};
  return {
    content: getResponsesOutputText(response),
    reasoningContent: null,
    finishReason:
      response?.status === "incomplete" &&
      response?.incomplete_details?.reason === "max_output_tokens"
        ? "length"
        : "stop",
    usage: {
      promptTokens: usage.input_tokens ?? null,
      completionTokens: usage.output_tokens ?? null,
      totalTokens: usage.total_tokens ?? null,
      reasoningTokens: usage.output_tokens_details?.reasoning_tokens ?? null,
      cachedTokens: usage.input_tokens_details?.cached_tokens ?? null
    },
    raw: response
  };
}

function buildTokenLimitParams({ baseURL, model, maxOutputTokens }) {
  const maxOutputTokensValue = getMaxOutputTokens(maxOutputTokens);
  const key = shouldUseMaxCompletionTokens({ baseURL, model })
    ? "max_completion_tokens"
    : "max_tokens";
  return { [key]: maxOutputTokensValue };
}

function buildChatParams({
  baseURL,
  model,
  messages,
  maxOutputTokens,
  temperature,
  reasoningEffort,
  reasoningSupported,
  jsonMode
}) {
  const params = {
    model,
    messages,
    ...buildTokenLimitParams({ baseURL, model, maxOutputTokens })
  };
  if (
    Number.isFinite(Number(temperature)) &&
    !shouldSendReasoningEffort({ model, reasoningSupported })
  ) {
    params.temperature = Number(temperature);
  }
  if (isDeepSeekEndpoint(baseURL)) {
    if (reasoningEffort === "none") {
      params.thinking = { type: "disabled" };
    } else if (reasoningEffort && reasoningEffort !== "default") {
      params.thinking = { type: "enabled" };
      params.reasoning_effort = reasoningEffort;
    }
  } else if (
    reasoningEffort &&
    reasoningEffort !== "default" &&
    shouldSendReasoningEffort({ model, reasoningSupported })
  ) {
    params.reasoning_effort = getEffectiveReasoningEffort(model, reasoningEffort);
  }
  if (jsonMode) {
    params.response_format = { type: "json_object" };
  }
  return params;
}

async function sendChatCompletion(client, params) {
  if (Object.hasOwn(params, "thinking")) {
    return await client.post("/chat/completions", { body: params });
  }
  return await client.chat.completions.create(params);
}

async function requestChatCompletion(client, options) {
  const cacheKey = getCapabilityCacheKey(options);
  const cached = capabilityCache.get(cacheKey);
  if (cached?.minimal) {
    return await sendChatCompletion(client, {
      model: options.model,
      messages: options.messages,
      [cached.tokenParam]: getMaxOutputTokens(options.maxOutputTokens)
    });
  }

  try {
    return await sendChatCompletion(client, buildChatParams(options));
  } catch (error) {
    if (!isUnsupportedParameterError(error)) {
      throw error;
    }
    const message = String(error?.message ?? "");
    const initialTokenParam = shouldUseMaxCompletionTokens(options)
      ? "max_completion_tokens"
      : "max_tokens";
    const tokenParam = /max_completion_tokens/i.test(message)
      ? "max_tokens"
      : /max_tokens/i.test(message)
        ? "max_completion_tokens"
        : initialTokenParam;
    const completion = await sendChatCompletion(client, {
      model: options.model,
      messages: options.messages,
      [tokenParam]: getMaxOutputTokens(options.maxOutputTokens)
    });
    capabilityCache.set(cacheKey, { minimal: true, tokenParam });
    return completion;
  }
}

function buildResponsesParams({
  baseURL,
  model,
  messages,
  maxOutputTokens,
  reasoningEffort,
  reasoningSupported,
  jsonMode
}) {
  const systemMessages = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const input = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role,
      content: message.content
    }));
  const params = {
    model,
    input,
    max_output_tokens: getMaxOutputTokens(maxOutputTokens)
  };
  if (systemMessages) {
    params.instructions = systemMessages;
  }
  if (
    reasoningEffort &&
    reasoningEffort !== "default" &&
    (shouldSendReasoningEffort({ model, reasoningSupported }) ||
      isDeepSeekEndpoint(baseURL))
  ) {
    params.reasoning = {
      effort: getEffectiveReasoningEffort(model, reasoningEffort)
    };
  }
  if (jsonMode) {
    params.text = { format: { type: "json_object" } };
  }
  return params;
}

async function requestResponsesCompletion(client, options) {
  const params = buildResponsesParams(options);
  try {
    return await client.responses.create(params);
  } catch (error) {
    if (!isUnsupportedParameterError(error)) {
      throw error;
    }
    const minimalParams = {
      model: options.model,
      input: params.input,
      max_output_tokens: params.max_output_tokens
    };
    if (params.instructions) {
      minimalParams.instructions = params.instructions;
    }
    return await client.responses.create(minimalParams);
  }
}

export async function completes(
  {
    baseURL,
    apiKey,
    model,
    headers,
    apiMode = "chat",
    maxOutputTokens,
    temperature = 0.1,
    reasoningEffort = "default",
    reasoningSupported = null,
    jsonMode = true
  },
  messages
) {
  const client = createClient({ baseURL, apiKey, headers });
  const options = {
    baseURL,
    model,
    messages,
    maxOutputTokens,
    temperature,
    reasoningEffort,
    reasoningSupported,
    jsonMode
  };
  if (apiMode === "responses") {
    return normalizeResponsesCompletion(
      await requestResponsesCompletion(client, options)
    );
  }
  return normalizeChatCompletion(await requestChatCompletion(client, options));
}

export async function listModels({
  baseURL,
  apiKey,
  headers,
  apiMode,
  decisionApiPath
}) {
  const normalizedBaseURL = normalizeBaseURL(baseURL);
  if (!normalizedBaseURL) {
    throw new Error("Base URL 不能为空");
  }
  const requestHeaders = {
    Accept: "application/json",
    ...normalizeHeaders(headers)
  };
  const normalizedApiKey = String(apiKey ?? "").trim();
  if (normalizedApiKey && !hasAuthorizationHeader(requestHeaders)) {
    requestHeaders.Authorization = `Bearer ${normalizedApiKey}`;
  }
  const response = await fetch(
    resolveModelListURL({
      baseURL: normalizedBaseURL,
      apiMode,
      decisionApiPath
    }),
    {
      headers: requestHeaders,
      signal: AbortSignal.timeout(MODEL_LIST_TIMEOUT_MS)
    }
  );
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(
      `获取模型列表失败：HTTP ${response.status} ${bodyText.slice(0, 300)}`
    );
  }
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    throw new Error("模型列表接口没有返回合法 JSON");
  }
  const modelList = Array.isArray(body?.data)
    ? body.data
    : Array.isArray(body)
      ? body
      : [];
  return modelList.map(normalizeModelListItem).filter((item) => item.id);
}
