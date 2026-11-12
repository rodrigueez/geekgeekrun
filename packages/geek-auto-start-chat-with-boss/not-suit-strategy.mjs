export function findConditionByStrategy(reasonToStrategyMap, strategy) {
  return Object.keys(reasonToStrategyMap ?? {}).find(
    (condition) => reasonToStrategyMap[condition] === strategy
  )
}
