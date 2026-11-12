export function normalizeJobSourceList(jobSourceList) {
  const normalizedJobSource = []
  const addedSourceSet = new Set()
  for (const source of (jobSourceList ?? [])) {
    if (addedSourceSet.has(source.type)) {
      continue
    }
    if (!source?.enabled) {
      continue
    }
    if (source.type === 'search') {
      for (const searchOption of (source.children ?? [])) {
        if (!searchOption.enabled || !searchOption.keyword?.trim()) {
          continue
        }
        const key = [source.type, searchOption.keyword.trim()].join('__')
        if (addedSourceSet.has(key)) {
          continue
        }
        normalizedJobSource.push({
          type: 'search',
          keyword: searchOption.keyword.trim()
        })
        addedSourceSet.add(key)
      }
      addedSourceSet.add(source.type)
    } else {
      normalizedJobSource.push({
        type: source.type
      })
      addedSourceSet.add(source.type)
    }
  }
  if (!normalizedJobSource.length) {
    normalizedJobSource.push({
      type: 'expect'
    })
  }
  return normalizedJobSource
}
