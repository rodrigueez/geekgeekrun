export const JOB_CANDIDATE_STATUS = {
  CANDIDATE: 1,
  QUEUED: 2,
  CHATTING: 3,
  CHATTED: 4,
  INVALID: 5,
  EXCLUDED: 6
}

const LIST_FIELD_NAMES = [
  'jobName',
  'brandName',
  'salaryDesc',
  'cityName',
  'areaDistrict',
  'businessDistrict',
  'jobType',
  'jobExperience',
  'jobDegree',
  'daysPerWeekDesc',
  'leastMonthDesc',
  'brandIndustry',
  'brandStageName',
  'brandScaleName'
]

function pickListFields(listJob = {}) {
  const snapshot = {}
  for (const name of LIST_FIELD_NAMES) {
    const value = listJob?.[name]
    if (value !== undefined && value !== null && value !== '') {
      snapshot[name] = value
    }
  }
  if (Array.isArray(listJob?.skills) && listJob.skills.length) {
    snapshot.skills = listJob.skills.slice(0, 30)
  }
  if (Array.isArray(listJob?.jobLabels) && listJob.jobLabels.length) {
    snapshot.jobLabels = listJob.jobLabels.slice(0, 10)
  }
  return snapshot
}

export function buildJobCandidateRecord({
  encryptCurrentUserId,
  profileId = null,
  jobInfo,
  listJob,
  matchScore = null,
  reasons = [],
  components = null,
  semanticResult = null,
  decision = 'candidate',
  sourceKey = null,
  searchKeyword = null,
  filterConditionKey = null,
  now = new Date()
}) {
  if (!encryptCurrentUserId) {
    throw new Error('encryptCurrentUserId is required')
  }
  const encryptJobId = jobInfo?.encryptId ?? listJob?.encryptJobId
  if (!encryptJobId) {
    throw new Error('encryptJobId is required')
  }
  return {
    encryptCurrentUserId,
    encryptJobId,
    profileId,
    status: JOB_CANDIDATE_STATUS.CANDIDATE,
    matchScore: typeof matchScore === 'number' ? Math.round(matchScore) : null,
    reasonJson: JSON.stringify({
      decision,
      reasons: Array.isArray(reasons) ? reasons : [],
      components: components ?? null,
      semantic: semanticResult
        ? {
            accepted: semanticResult.accepted ?? null,
            confidence: semanticResult.confidence ?? null,
            reasons: semanticResult.reasons ?? [],
            constraints: semanticResult.constraints ?? []
          }
        : null
    }),
    jobSnapshotJson: JSON.stringify(pickListFields(listJob)),
    sourceKey,
    searchKeyword,
    filterConditionKey,
    collectedAt: now,
    statusUpdatedAt: now
  }
}

export function isCandidateChattable(status) {
  return status === JOB_CANDIDATE_STATUS.QUEUED
}

export function summarizeCandidateForList(record = {}) {
  let reasons = []
  let decision = 'candidate'
  let snapshot = {}
  try {
    const parsedReason = JSON.parse(record.reasonJson ?? '{}') ?? {}
    reasons = parsedReason.reasons ?? []
    decision = parsedReason.decision ?? 'candidate'
  } catch {
    reasons = []
  }
  try {
    snapshot = JSON.parse(record.jobSnapshotJson ?? '{}') ?? {}
  } catch {
    snapshot = {}
  }
  return {
    id: record.id,
    encryptJobId: record.encryptJobId,
    status: record.status,
    matchScore: record.matchScore,
    decision,
    reasons,
    jobName: snapshot.jobName ?? '',
    brandName: snapshot.brandName ?? '',
    salaryDesc: snapshot.salaryDesc ?? '',
    cityName: snapshot.cityName ?? '',
    jobType: snapshot.jobType ?? null,
    daysPerWeekDesc: snapshot.daysPerWeekDesc ?? '',
    skills: snapshot.skills ?? [],
    collectedAt: record.collectedAt
  }
}
