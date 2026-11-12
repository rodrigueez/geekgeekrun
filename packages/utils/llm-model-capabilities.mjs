function toPositiveInteger(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function normalizeReasoningLevels(item) {
  const levels =
    item?.reasoning_levels ??
    item?.reasoning_efforts ??
    item?.supported_reasoning_levels ??
    item?.reasoning?.levels ??
    item?.reasoning?.efforts ??
    [];
  const levelList = Array.isArray(levels)
    ? levels
    : levels && typeof levels === "object"
      ? Object.keys(levels)
      : [];
  return levelList
    .map((level) =>
      typeof level === "string"
        ? level
        : level?.effort ?? level?.value ?? level?.name
    )
    .map((level) => String(level ?? "").trim())
    .filter(Boolean);
}

export function normalizeModelListItem(item) {
  const reasoningLevels = normalizeReasoningLevels(item);
  const defaultParameters = item?.default_parameters ?? {};
  return {
    id: item?.id ?? item?.model ?? item?.name ?? "",
    displayName: item?.display_name ?? item?.name ?? null,
    ownedBy: item?.owned_by ?? null,
    reasoning:
      typeof item?.reasoning === "boolean"
        ? item.reasoning
        : reasoningLevels.length
          ? true
          : null,
    reasoningLevels,
    defaultReasoningEffort:
      item?.default_reasoning_effort ??
      defaultParameters.reasoning_effort ??
      null,
    maxOutputTokens:
      toPositiveInteger(item?.max_output_tokens) ??
      toPositiveInteger(defaultParameters.max_output_tokens),
    defaultMaxOutputTokens: toPositiveInteger(
      item?.default_max_output_tokens ??
        item?.recommended_max_output_tokens ??
        defaultParameters.max_output_tokens
    ),
    maxInputTokens: toPositiveInteger(item?.max_input_tokens),
    contextLength: toPositiveInteger(
      item?.context_length ?? item?.context_window
    ),
    supportedParameters: Array.isArray(item?.supported_parameters)
      ? item.supported_parameters
      : [],
    type: item?.type ?? null,
    endpoint: item?.endpoint ?? null,
    nativeEndpoints: item?.native_endpoints ?? null
  };
}

export function isReasoningModel(model) {
  return /(^|\/)(o[1-9]\d*|gpt-5|gpt-6)/i.test(String(model ?? ""));
}

export function shouldSendReasoningEffort({ model, reasoningSupported } = {}) {
  if (reasoningSupported === true) {
    return true;
  }
  if (reasoningSupported === false) {
    return false;
  }
  return isReasoningModel(model);
}
