import { createHash } from 'node:crypto'

export const DEFAULT_JOB_MATCH_WEIGHTS = {
  title: 25,
  skills: 35,
  salary: 15,
  experience: 10,
  company: 10,
  activity: 5
}

const ACTIVE_TIME_SCORE = {
  刚刚活跃: 1,
  今日活跃: 0.95,
  昨日活跃: 0.85,
  '3日内活跃': 0.75,
  本周活跃: 0.65,
  '2周内活跃': 0.5,
  本月活跃: 0.4,
  '2月内活跃': 0.3,
  '3月内活跃': 0.2,
  '4月内活跃': 0.15,
  '5月内活跃': 0.1,
  近半年活跃: 0.05,
  半年前活跃: 0
}

const STOP_WORDS = new Set([
  '工作', '经验', '负责', '相关', '以上', '以及', '进行', '能够', '熟悉',
  '了解', '优先', '要求', '岗位', '职位', '公司', '我们', '你的', '您',
  '能力', '具备', '使用', '参与', '完成', '熟练', '掌握', '有较强', '良好'
])

function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase()
}

function compactText(value) {
  return normalizeText(value).replace(/[\s\-_/，。；、,.!?！？：:（）()【】[\]{}'"“”‘’]+/g, '')
}

function addToken(tokens, token) {
  const normalized = normalizeText(token)
  if (
    normalized.length >= 2 &&
    !STOP_WORDS.has(normalized)
  ) {
    tokens.add(normalized)
  }
}

export function tokenizeForMatch(value) {
  const text = normalizeText(value)
  const tokens = new Set()
  for (const match of text.matchAll(/[a-z0-9][a-z0-9+#._-]*/g)) {
    addToken(tokens, match[0])
  }
  for (const match of text.matchAll(/[\u4e00-\u9fff]+/g)) {
    const sequence = match[0]
    if (sequence.length <= 8) {
      addToken(tokens, sequence)
    }
    for (let i = 0; i < sequence.length - 1; i++) {
      addToken(tokens, sequence.slice(i, i + 2))
    }
  }
  return tokens
}

function jaccardSimilarity(a, b) {
  if (!a.size || !b.size) {
    return 0
  }
  let intersection = 0
  for (const token of a) {
    if (b.has(token)) {
      intersection++
    }
  }
  return intersection / (a.size + b.size - intersection)
}

function resumeContentToText(resume) {
  const content = resume?.content
  if (!content) {
    return normalizeText(resume)
  }
  const workExperiences = (content.geekWorkExpList ?? []).map((item) =>
    [
      item.company,
      item.positionName,
      item.workDescription,
      item.performance
    ].filter(Boolean).join(' ')
  )
  const projects = (content.geekProjExpList ?? []).map((item) =>
    [
      item.name,
      item.roleName,
      item.projectDescription,
      item.performance
    ].filter(Boolean).join(' ')
  )
  return [
    content.name,
    content.workYearDesc,
    content.expectJob,
    content.userDescription,
    ...workExperiences,
    ...projects
  ].filter(Boolean).join('\n')
}

export function buildResumeProfile(resume) {
  const text = resumeContentToText(resume)
  const content = resume?.content ?? {}
  const expectJob = normalizeText(content.expectJob)
  const positions = (content.geekWorkExpList ?? [])
    .map((item) => normalizeText(item.positionName))
    .filter(Boolean)
  return {
    text,
    normalizedText: normalizeText(text),
    compactText: compactText(text),
    tokens: tokenizeForMatch(text),
    expectJob,
    positions,
    isUsable: text.trim().length >= 20
  }
}

export function normalizeMatchWeights(weights) {
  const result = { ...DEFAULT_JOB_MATCH_WEIGHTS }
  for (const key of Object.keys(DEFAULT_JOB_MATCH_WEIGHTS)) {
    const value = Number(weights?.[key])
    if (Number.isFinite(value) && value >= 0) {
      result[key] = value
    }
  }
  return result
}

function normalizeJob(job) {
  const jobInfo = job?.jobInfo ?? job ?? {}
  const bossInfo = job?.bossInfo ?? job ?? {}
  const rawSkills =
    jobInfo.showSkills ??
    jobInfo.skills ??
    job?.showSkills ??
    job?.skills ??
    job?.jobLabels ??
    []
  const skills = (Array.isArray(rawSkills) ? rawSkills : [rawSkills])
    .map((item) => normalizeText(item?.name ?? item?.text ?? item))
    .filter(Boolean)
  return {
    jobName: normalizeText(jobInfo.jobName ?? job?.jobName),
    positionName: normalizeText(jobInfo.positionName ?? job?.positionName),
    description: normalizeText(
      jobInfo.postDescription ??
      job?.postDescription ??
      job?.description
    ),
    skills,
    salaryDesc: job?.salaryDesc ?? jobInfo.salaryDesc,
    cityName: job?.cityName ?? jobInfo.cityName,
    jobExperience: job?.jobExperience ?? jobInfo.jobExperience,
    brandName: job?.brandName ?? jobInfo.brandName,
    activeTimeDesc:
      bossInfo.activeTimeDesc ??
      job?.bossActiveTimeDesc ??
      job?.activeTimeDesc ??
      ''
  }
}

function scoreTitle(job, profile) {
  const jobTitle = [job.jobName, job.positionName].filter(Boolean).join(' ')
  const resumeTitle = [profile.expectJob, ...profile.positions].join(' ')
  if (!jobTitle || !resumeTitle) {
    return 0.5
  }
  if (
    profile.compactText &&
    compactText(jobTitle) &&
    profile.compactText.includes(compactText(jobTitle))
  ) {
    return 1
  }
  const similarity = jaccardSimilarity(
    tokenizeForMatch(jobTitle),
    tokenizeForMatch(resumeTitle)
  )
  return Math.min(1, similarity * 2.5)
}

function scoreSkills(job, profile) {
  if (job.skills.length) {
    const matched = job.skills.filter((skill) => {
      const compactSkill = compactText(skill)
      return compactSkill && profile.compactText.includes(compactSkill)
    })
    return matched.length / job.skills.length
  }
  if (!job.description) {
    return 0.5
  }
  return Math.min(
    1,
    jaccardSimilarity(tokenizeForMatch(job.description), profile.tokens) * 3
  )
}

function scoreBooleanFit(value) {
  if (value === null || value === undefined) {
    return 0.5
  }
  return value ? 1 : 0
}

export function scoreJobMatch(
  rawJob,
  profile,
  {
    weights = DEFAULT_JOB_MATCH_WEIGHTS,
    salarySuit = null,
    experienceSuit = null,
    companyPreferred = null
  } = {}
) {
  if (!profile?.isUsable) {
    return {
      score: 0,
      isScored: false,
      reasons: ['简历内容不足，未启用匹配评分'],
      components: null
    }
  }
  const job = normalizeJob(rawJob)
  const normalizedWeights = normalizeMatchWeights(weights)
  const components = {
    title: scoreTitle(job, profile),
    skills: scoreSkills(job, profile),
    salary: scoreBooleanFit(salarySuit),
    experience: scoreBooleanFit(experienceSuit),
    company: scoreBooleanFit(companyPreferred),
    activity: ACTIVE_TIME_SCORE[job.activeTimeDesc] ?? 0.5
  }
  const totalWeight = Object.values(normalizedWeights).reduce((sum, value) => sum + value, 0)
  const score = totalWeight
    ? Math.round(
        Object.entries(normalizedWeights).reduce(
          (sum, [key, weight]) => sum + weight * (components[key] ?? 0),
          0
        ) / totalWeight * 100
      )
    : 0
  const reasons = []
  if (components.title >= 0.75) reasons.push('职位标题匹配')
  if (components.skills >= 0.6) reasons.push('技能关键词匹配')
  if (components.salary === 1) reasons.push('薪资匹配')
  else if (components.salary === 0) reasons.push('薪资不匹配')
  if (components.activity >= 0.75) reasons.push('招聘者近期活跃')
  return {
    score,
    isScored: true,
    reasons,
    components
  }
}

export function rankJobCandidates(
  jobs,
  {
    profile,
    weights = DEFAULT_JOB_MATCH_WEIGHTS,
    isEligible = () => true,
    getOptions = () => ({})
  } = {}
) {
  const candidates = []
  for (let index = 0; index < (jobs?.length ?? 0); index++) {
    const job = jobs[index]
    if (!isEligible(job, index)) {
      continue
    }
    const result = scoreJobMatch(job, profile, {
      weights,
      ...getOptions(job, index)
    })
    candidates.push({
      index,
      job,
      ...result
    })
  }
  if (!profile?.isUsable) {
    return candidates
  }
  return candidates.sort((a, b) => b.score - a.score || a.index - b.index)
}

export function getResumeHash(profile) {
  return createHash('sha256')
    .update(String(profile?.text ?? ''))
    .digest('hex')
    .slice(0, 24)
}

export function getJobMatchInputHash(rawJob) {
  const job = normalizeJob(rawJob)
  return createHash('sha256')
    .update(JSON.stringify({
      jobName: job.jobName,
      positionName: job.positionName,
      description: job.description,
      skills: job.skills
    }))
    .digest('hex')
    .slice(0, 24)
}

export function combineMatchScores(deterministicScore, llmScore, llmWeight = 0.3) {
  if (!Number.isFinite(llmScore)) {
    return deterministicScore
  }
  const weight = Math.min(Math.max(Number(llmWeight) || 0, 0), 1)
  return Math.round(
    deterministicScore * (1 - weight) + Math.min(Math.max(llmScore, 0), 100) * weight
  )
}
