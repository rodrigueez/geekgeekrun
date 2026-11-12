export function getJobSourceKey(source, index = 0) {
  if (!source) {
    return null
  }
  if (source.type === 'search') {
    return `search:${String(source.keyword ?? '').trim()}`
  }
  if (source.type === 'expect') {
    return `expect:${Number.isInteger(source.index) ? source.index : index}`
  }
  return String(source.type ?? '')
}

export function rotateListToKey(list, key, getKey) {
  if (!Array.isArray(list) || !list.length || key === null || key === undefined) {
    return list
  }
  const index = list.findIndex((item) => getKey(item) === key)
  if (index <= 0) {
    return list
  }
  return [...list.slice(index), ...list.slice(0, index)]
}

export function findCheckpointBySourceKey(checkpoints, sourceKey) {
  if (!Array.isArray(checkpoints) || !sourceKey) {
    return null
  }
  return checkpoints.find((item) => item?.sourceKey === sourceKey) ?? null
}
