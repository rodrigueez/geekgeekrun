export const DEFAULT_PERFORMANCE_MIN_CHATS = 10

function toCount(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : 0
}

function smoothedRate(success, trials) {
  return (success + 1) / (trials + 2)
}

function createMetric(row, minChats) {
  const views = toCount(row.views)
  const chats = toCount(row.chats)
  const replies = toCount(row.replies)
  const interviews = toCount(row.interviews)
  const chatRate = smoothedRate(chats, views)
  const replyRate = smoothedRate(replies, chats)
  const interviewRate = smoothedRate(interviews, chats)
  return {
    views,
    chats,
    replies,
    interviews,
    chatRate,
    replyRate,
    interviewRate,
    isReliable: chats >= minChats,
    score: chatRate * 0.3 + replyRate * 0.6 + interviewRate * 0.1
  }
}

function addCounts(target, row) {
  target.views += toCount(row.views)
  target.chats += toCount(row.chats)
  target.replies += toCount(row.replies)
  target.interviews += toCount(row.interviews)
}

export function buildPerformanceMaps(
  rows,
  { minChats = DEFAULT_PERFORMANCE_MIN_CHATS } = {}
) {
  const sourceCounts = new Map()
  const filterCounts = new Map()
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row?.sourceKey) {
      continue
    }
    if (!sourceCounts.has(row.sourceKey)) {
      sourceCounts.set(row.sourceKey, {
        views: 0,
        chats: 0,
        replies: 0,
        interviews: 0
      })
    }
    addCounts(sourceCounts.get(row.sourceKey), row)
    if (row.filterConditionKey) {
      const filterKey = `${row.sourceKey}::${row.filterConditionKey}`
      if (!filterCounts.has(filterKey)) {
        filterCounts.set(filterKey, {
          views: 0,
          chats: 0,
          replies: 0,
          interviews: 0
        })
      }
      addCounts(filterCounts.get(filterKey), row)
    }
  }
  return {
    bySource: new Map(
      [...sourceCounts.entries()].map(([key, counts]) => [
        key,
        createMetric(counts, minChats)
      ])
    ),
    byFilter: new Map(
      [...filterCounts.entries()].map(([key, counts]) => [
        key,
        createMetric(counts, minChats)
      ])
    )
  }
}

export function sortSourcesByPerformance(sources, maps) {
  return [...(sources ?? [])].sort((a, b) => {
    const aMetric = maps?.bySource?.get(a?.sourceKey)
    const bMetric = maps?.bySource?.get(b?.sourceKey)
    if (!aMetric?.isReliable || !bMetric?.isReliable) {
      return 0
    }
    return bMetric.score - aMetric.score
  })
}

export function sortFiltersByPerformance(
  filters,
  sourceKey,
  maps,
  getFilterKey
) {
  return [...(filters ?? [])].sort((a, b) => {
    const aKey = `${sourceKey}::${getFilterKey(a)}`
    const bKey = `${sourceKey}::${getFilterKey(b)}`
    const aMetric = maps?.byFilter?.get(aKey)
    const bMetric = maps?.byFilter?.get(bKey)
    if (!aMetric?.isReliable || !bMetric?.isReliable) {
      return 0
    }
    return bMetric.score - aMetric.score
  })
}
