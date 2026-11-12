import { randomUUID } from 'node:crypto'

export const JOB_SEARCH_PROFILE_FILE_NAME = 'job-search-profiles.json'

export const JOB_SEARCH_BOSS_FIELDS = [
  'combineRecommendJobFilterType',
  'anyCombineRecommendJobFilter',
  'staticCombineRecommendJobFilterConditions',
  'isSkipEmptyConditionForCombineRecommendJobFilter',
  'expectJobNameRegExpStr',
  'expectJobTypeRegExpStr',
  'expectJobDescRegExpStr',
  'jobNotMatchStrategy',
  'expectCityList',
  'expectCityNotMatchStrategy',
  'strategyScopeOptionWhenMarkJobCityNotMatch',
  'expectSalaryCalculateWay',
  'expectSalaryNotMatchStrategy',
  'strategyScopeOptionWhenMarkSalaryNotMatch',
  'expectSalaryLow',
  'expectSalaryHigh',
  'expectWorkExpList',
  'expectWorkExpNotMatchStrategy',
  'strategyScopeOptionWhenMarkJobWorkExpNotMatch',
  'jobDetailRegExpMatchLogic',
  'maxRecommendJobFilterCombinations',
  'jobMatchEnabled',
  'jobMatchMinScore',
  'jobMatchWeights',
  'jobMatchLlmEnabled',
  'jobMatchLlmTopN',
  'jobMatchLlmMaxCallsPerRun',
  'jobSemanticFilterEnabled',
  'jobSemanticFilterCriteria',
  'jobSemanticFilterListPrecheck',
  'jobSemanticFilterTopN',
  'jobSemanticFilterMaxCallsPerRun',
  'jobSemanticFilterMinConfidence',
  'jobSourceList',
  'blockCompanyNameRegExpStr',
  'blockCompanyNameRegMatchStrategy',
  'fieldsForUseCommonConfig'
]

const clone = (value) => (value == null ? value : structuredClone(value))

const isPlainObject = (value) =>
  !!value && typeof value === 'object' && !Array.isArray(value)

export function captureJobSearchProfileConfig({
  bossConfig = {},
  commonJobConditionConfig = {},
  targetCompanyList = [],
  resumeList = []
} = {}) {
  const boss = {}
  for (const field of JOB_SEARCH_BOSS_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(bossConfig ?? {}, field)) {
      boss[field] = clone(bossConfig[field])
    }
  }

  return {
    boss,
    commonJobCondition: isPlainObject(commonJobConditionConfig)
      ? clone(commonJobConditionConfig)
      : {},
    targetCompanyList: Array.isArray(targetCompanyList)
      ? targetCompanyList.map((it) => String(it))
      : [],
    resumeList: Array.isArray(resumeList) ? clone(resumeList) : []
  }
}

export function normalizeJobSearchProfileConfig(config = {}) {
  const boss = isPlainObject(config?.boss) ? clone(config.boss) : {}
  return {
    boss,
    commonJobCondition: isPlainObject(config?.commonJobCondition)
      ? clone(config.commonJobCondition)
      : {},
    targetCompanyList: Array.isArray(config?.targetCompanyList)
      ? config.targetCompanyList.map((it) => String(it))
      : [],
    resumeList: Array.isArray(config?.resumeList) ? clone(config.resumeList) : []
  }
}

export function applyJobSearchProfileToBossConfig(currentBossConfig = {}, profile) {
  const nextBossConfig = { ...(currentBossConfig ?? {}) }
  const profileBoss = profile?.config?.boss ?? {}

  for (const field of JOB_SEARCH_BOSS_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(profileBoss, field)) {
      nextBossConfig[field] = clone(profileBoss[field])
    } else {
      delete nextBossConfig[field]
    }
  }

  return nextBossConfig
}

export function createJobSearchProfile(name, config, { now = Date.now(), id = randomUUID() } = {}) {
  const normalizedName = String(name ?? '').trim() || '未命名方案'
  return {
    id,
    name: normalizedName,
    createdAt: now,
    updatedAt: now,
    config: normalizeJobSearchProfileConfig(config)
  }
}

export function normalizeJobSearchProfileFile(raw, liveConfig = {}) {
  if (raw && Array.isArray(raw.profiles) && raw.profiles.length) {
    const profiles = raw.profiles
      .filter((profile) => profile && typeof profile.id === 'string' && profile.id)
      .map((profile) => {
        const createdAt = Number(profile.createdAt) || Date.now()
        return {
          id: profile.id,
          name: String(profile.name ?? '').trim() || '未命名方案',
          createdAt,
          updatedAt: Number(profile.updatedAt) || createdAt,
          config: normalizeJobSearchProfileConfig(profile.config)
        }
      })

    if (profiles.length) {
      const activeProfileId = profiles.some(
        (profile) => profile.id === raw.activeProfileId
      )
        ? raw.activeProfileId
        : profiles[0].id
      return {
        version: 1,
        activeProfileId,
        profiles
      }
    }
  }

  const defaultProfile = createJobSearchProfile(
    '默认',
    captureJobSearchProfileConfig(liveConfig)
  )
  return {
    version: 1,
    activeProfileId: defaultProfile.id,
    profiles: [defaultProfile]
  }
}

export function getActiveJobSearchProfile(profileFile) {
  return (
    profileFile?.profiles?.find(
      (profile) => profile.id === profileFile.activeProfileId
    ) ?? profileFile?.profiles?.[0] ?? null
  )
}

export function summarizeJobSearchProfile(profile) {
  const boss = profile?.config?.boss ?? {}
  const keywords = []
  for (const source of boss.jobSourceList ?? []) {
    if (source?.type !== 'search' || !source.enabled) {
      continue
    }
    for (const option of source.children ?? []) {
      const keyword = option?.keyword?.trim?.()
      if (option?.enabled && keyword) {
        keywords.push(keyword)
      }
    }
  }

  const uniqueKeywords = [...new Set(keywords)]
  const citySource = boss.fieldsForUseCommonConfig?.city
    ? profile?.config?.commonJobCondition?.expectCityList
    : boss.expectCityList
  const cities = Array.isArray(citySource) ? citySource.filter(Boolean) : []
  const hasResume = Array.isArray(profile?.config?.resumeList)
    ? profile.config.resumeList.length > 0
    : false

  return {
    keywords: uniqueKeywords,
    cities,
    hasResume,
    description: [
      uniqueKeywords.length ? `搜索词：${uniqueKeywords.join(' / ')}` : '未设置搜索词',
      cities.length ? `城市：${cities.join(' / ')}` : '城市不限',
      hasResume ? '含简历' : '未填简历'
    ].join(' · ')
  }
}

export function serializeJobSearchProfileList(profileFile) {
  const activeProfile = getActiveJobSearchProfile(profileFile)
  return {
    activeProfileId: activeProfile?.id ?? '',
    profiles: (profileFile?.profiles ?? []).map((profile) => {
      const summary = summarizeJobSearchProfile(profile)
      return {
        id: profile.id,
        name: profile.name,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
        isActive: profile.id === profileFile.activeProfileId,
        description: summary.description,
        keywords: summary.keywords,
        cities: summary.cities,
        hasResume: summary.hasResume
      }
    })
  }
}

export function validateJobSearchProfileName(name) {
  const normalizedName = String(name ?? '').trim()
  if (!normalizedName) {
    throw new Error('方案名称不能为空')
  }
  if (normalizedName.length > 40) {
    throw new Error('方案名称不能超过 40 个字符')
  }
  return normalizedName
}
