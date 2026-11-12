import {
  readConfigFile,
  writeConfigFile
} from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import {
  JOB_SEARCH_PROFILE_FILE_NAME,
  applyJobSearchProfileToBossConfig,
  captureJobSearchProfileConfig,
  createJobSearchProfile,
  getActiveJobSearchProfile,
  normalizeJobSearchProfileFile,
  serializeJobSearchProfileList,
  validateJobSearchProfileName
} from '@geekgeekrun/geek-auto-start-chat-with-boss/job-search-profile.mjs'

export type JobSearchProfileFile = {
  version: number
  activeProfileId: string
  profiles: Array<{
    id: string
    name: string
    createdAt: number
    updatedAt: number
    config: {
      boss: Record<string, unknown>
      commonJobCondition: Record<string, unknown>
      targetCompanyList: string[]
      resumeList: unknown[]
    }
  }>
}

function readLiveConfig() {
  return {
    bossConfig: readConfigFile('boss.json') ?? {},
    commonJobConditionConfig: readConfigFile('common-job-condition-config.json') ?? {},
    targetCompanyList: readConfigFile('target-company-list.json') ?? [],
    resumeList: readConfigFile('resumes.json') ?? []
  }
}

async function readProfileFile(): Promise<JobSearchProfileFile> {
  const raw = readConfigFile(JOB_SEARCH_PROFILE_FILE_NAME)
  const profileFile = normalizeJobSearchProfileFile(raw, readLiveConfig()) as JobSearchProfileFile
  if (!raw || JSON.stringify(raw) !== JSON.stringify(profileFile)) {
    await writeConfigFile(JOB_SEARCH_PROFILE_FILE_NAME, profileFile)
  }
  return profileFile
}

async function writeProfileFile(profileFile: JobSearchProfileFile) {
  await writeConfigFile(JOB_SEARCH_PROFILE_FILE_NAME, profileFile)
}

async function getProfilePayload() {
  return serializeJobSearchProfileList(await readProfileFile())
}

function ensureUniqueName(
  profileFile: JobSearchProfileFile,
  name: string,
  excludeId?: string
) {
  const normalizedName = name.toLocaleLowerCase()
  const duplicated = profileFile.profiles.some(
    (profile) =>
      profile.id !== excludeId && profile.name.toLocaleLowerCase() === normalizedName
  )
  if (duplicated) {
    throw new Error('已存在同名方案')
  }
}

async function captureIntoProfile(profile: JobSearchProfileFile['profiles'][number]) {
  profile.config = captureJobSearchProfileConfig(readLiveConfig())
  profile.updatedAt = Date.now()
}

async function applyProfile(profile: JobSearchProfileFile['profiles'][number]) {
  const currentBossConfig = readConfigFile('boss.json') ?? {}
  await Promise.all([
    writeConfigFile(
      'boss.json',
      applyJobSearchProfileToBossConfig(currentBossConfig, profile)
    ),
    writeConfigFile(
      'common-job-condition-config.json',
      profile.config.commonJobCondition ?? {}
    ),
    writeConfigFile(
      'target-company-list.json',
      profile.config.targetCompanyList ?? []
    ),
    writeConfigFile('resumes.json', profile.config.resumeList ?? [])
  ])
}

export async function syncActiveJobSearchProfile() {
  const profileFile = await readProfileFile()
  const activeProfile = getActiveJobSearchProfile(profileFile)
  if (!activeProfile) {
    return null
  }
  await captureIntoProfile(activeProfile)
  await writeProfileFile(profileFile)
  return serializeJobSearchProfileList(profileFile)
}

export async function listJobSearchProfiles() {
  return getProfilePayload()
}

export async function getActiveJobSearchProfileSummary() {
  const profileFile = await readProfileFile()
  const profile = getActiveJobSearchProfile(profileFile)
  return profile ? { id: profile.id, name: profile.name } : null
}

export async function createJobSearchProfileFromCurrent(name: string) {
  const profileFile = await readProfileFile()
  const normalizedName = validateJobSearchProfileName(name)
  ensureUniqueName(profileFile, normalizedName)

  const activeProfile = getActiveJobSearchProfile(profileFile)
  if (activeProfile) {
    await captureIntoProfile(activeProfile)
  }

  const newProfile = createJobSearchProfile(
    normalizedName,
    captureJobSearchProfileConfig(readLiveConfig())
  )
  profileFile.profiles.push(newProfile)
  profileFile.activeProfileId = newProfile.id
  await writeProfileFile(profileFile)
  return serializeJobSearchProfileList(profileFile)
}

export async function switchJobSearchProfile(id: string) {
  const profileFile = await readProfileFile()
  const targetProfile = profileFile.profiles.find((profile) => profile.id === id)
  if (!targetProfile) {
    throw new Error('方案不存在')
  }

  const activeProfile = getActiveJobSearchProfile(profileFile)
  if (activeProfile && activeProfile.id !== targetProfile.id) {
    await captureIntoProfile(activeProfile)
  }

  await applyProfile(targetProfile)
  profileFile.activeProfileId = targetProfile.id
  await writeProfileFile(profileFile)
  return serializeJobSearchProfileList(profileFile)
}

export async function saveCurrentJobSearchProfile() {
  const payload = await syncActiveJobSearchProfile()
  if (!payload) {
    throw new Error('当前方案不存在')
  }
  return payload
}

export async function renameJobSearchProfile(id: string, name: string) {
  const profileFile = await readProfileFile()
  const profile = profileFile.profiles.find((it) => it.id === id)
  if (!profile) {
    throw new Error('方案不存在')
  }
  const normalizedName = validateJobSearchProfileName(name)
  ensureUniqueName(profileFile, normalizedName, id)
  profile.name = normalizedName
  profile.updatedAt = Date.now()
  await writeProfileFile(profileFile)
  return serializeJobSearchProfileList(profileFile)
}

export async function deleteJobSearchProfile(id: string) {
  const profileFile = await readProfileFile()
  if (profileFile.profiles.length <= 1) {
    throw new Error('至少保留一个方案')
  }
  if (profileFile.activeProfileId === id) {
    throw new Error('当前方案不能删除，请先切换到其他方案')
  }
  const index = profileFile.profiles.findIndex((profile) => profile.id === id)
  if (index === -1) {
    throw new Error('方案不存在')
  }
  profileFile.profiles.splice(index, 1)
  await writeProfileFile(profileFile)
  return serializeJobSearchProfileList(profileFile)
}

