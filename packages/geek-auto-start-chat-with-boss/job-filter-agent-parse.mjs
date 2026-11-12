import { createHash } from 'node:crypto'

const MAX_CRITERIA_CHARS = 2000
const MAX_DESCRIPTION_CHARS = 4000

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeList(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => normalizeText(item))
    .filter(Boolean)
}

function truncate(value, maxLength) {
  const text = normalizeText(value)
  return text.length > maxLength ? `${text.slice(0, maxLength)}\n[已截断]` : text
}

function getJobInfo(job) {
  const jobInfo = job?.jobInfo ?? job ?? {}
  const bossInfo = job?.bossInfo ?? job ?? {}
  const skills =
    jobInfo.showSkills ??
    jobInfo.skills ??
    job?.showSkills ??
    job?.skills ??
    job?.jobLabels ??
    []
  return {
    jobName: normalizeText(jobInfo.jobName ?? job?.jobName),
    positionName: normalizeText(jobInfo.positionName ?? job?.positionName),
    description: normalizeText(
      jobInfo.postDescription ?? job?.postDescription ?? job?.description
    ),
    skills: normalizeList(
      (Array.isArray(skills) ? skills : [skills]).map(
        (item) => item?.name ?? item?.text ?? item
      )
    ),
    salaryDesc: normalizeText(job?.salaryDesc ?? jobInfo.salaryDesc),
    cityName: normalizeText(job?.cityName ?? jobInfo.cityName),
    jobExperience: normalizeText(job?.jobExperience ?? jobInfo.jobExperience),
    brandName: normalizeText(job?.brandName ?? jobInfo.brandName),
    activeTimeDesc: normalizeText(
      bossInfo.activeTimeDesc ??
      job?.bossActiveTimeDesc ??
      job?.activeTimeDesc
    )
  }
}

export function getCriteriaHash(criteria) {
  return createHash('sha256')
    .update(normalizeText(criteria))
    .digest('hex')
    .slice(0, 24)
}

export function getJobSemanticInputHash(job, stage) {
  const info = getJobInfo(job)
  return createHash('sha256')
    .update(JSON.stringify({ stage, ...info }))
    .digest('hex')
    .slice(0, 24)
}

export function buildJobFilterPlanMessages(criteria) {
  return [
    {
      role: 'system',
      content:
        '你是职位筛选规划器。只输出 JSON，不要输出 JSON 之外的文字。' +
        '把用户的自然语言求职要求整理成可执行筛选计划，不要添加用户没有说过的硬性条件。' +
        'JSON 字段：roleKeywords、employmentTypes、workModes、locations、mustHave、mustNotHave、summary。' +
        'employmentTypes 只能是“全职”“兼职”“实习”“合同工”“不限”中的值；workModes 只能是“线上”“线下”“混合”“不限”中的值。'
    },
    {
      role: 'user',
      content: truncate(criteria, MAX_CRITERIA_CHARS)
    }
  ]
}

export function parseJobFilterPlan(content) {
  const raw = normalizeText(content)
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start < 0 || end <= start) {
      throw new Error('职位筛选计划不是合法 JSON')
    }
    parsed = JSON.parse(raw.slice(start, end + 1))
  }
  return {
    roleKeywords: normalizeList(parsed?.roleKeywords),
    employmentTypes: normalizeList(parsed?.employmentTypes),
    workModes: normalizeList(parsed?.workModes),
    locations: normalizeList(parsed?.locations),
    mustHave: normalizeList(parsed?.mustHave),
    mustNotHave: normalizeList(parsed?.mustNotHave),
    summary: normalizeText(parsed?.summary)
  }
}

export function buildJobSemanticFilterMessages({ criteria, plan, job, stage }) {
  const info = getJobInfo(job)
  const description =
    stage === 'detail'
      ? truncate(info.description, MAX_DESCRIPTION_CHARS)
      : '[列表阶段，尚无职位详情]'
  return [
    {
      role: 'system',
      content:
        '你是职位语义筛选器。只输出 JSON，不要输出 JSON 之外的文字。' +
        '只有当职位明确违反用户的硬性要求时才返回 match=false；信息不足或只能推测时必须返回 match=true，并降低 confidence。' +
        '不要因为职位名称没有出现关键词就拒绝。' +
        'JSON 格式：{"match": true/false, "confidence": 0到1, "reasons": ["不超过3条"], "constraints": {"employmentType": "", "workMode": ""}}。'
    },
    {
      role: 'user',
      content: [
        '## 用户要求',
        truncate(criteria, MAX_CRITERIA_CHARS),
        '',
        '## 已整理的筛选计划',
        JSON.stringify(plan ?? {}, null, 2),
        '',
        `## 当前阶段：${stage}`,
        `职位名：${info.jobName}`,
        `岗位方向：${info.positionName}`,
        `技能标签：${info.skills.join('、')}`,
        `薪资：${info.salaryDesc}`,
        `城市：${info.cityName}`,
        `经验：${info.jobExperience}`,
        `公司：${info.brandName}`,
        `招聘者活跃度：${info.activeTimeDesc}`,
        '',
        '职位描述：',
        description
      ].join('\n')
    }
  ]
}

export function parseJobSemanticFilterResult(content) {
  const raw = normalizeText(content)
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start < 0 || end <= start) {
      throw new Error('职位语义筛选结果不是合法 JSON')
    }
    parsed = JSON.parse(raw.slice(start, end + 1))
  }
  const confidence = Number(parsed?.confidence)
  return {
    match: parsed?.match === true,
    confidence: Number.isFinite(confidence)
      ? Math.min(Math.max(confidence, 0), 1)
      : 0.5,
    reasons: normalizeList(parsed?.reasons).slice(0, 3),
    constraints:
      parsed?.constraints && typeof parsed.constraints === 'object'
        ? parsed.constraints
        : {}
  }
}

export function evaluatePlanHardReject(job, plan) {
  const info = getJobInfo(job)
  const titleText = [info.jobName, info.positionName, ...info.skills].join(' ')
  const reasons = []
  const wantsPartTime = plan?.employmentTypes?.includes('兼职')
  if (
    wantsPartTime &&
    /全职/.test(titleText) &&
    !/兼职/.test(titleText)
  ) {
    reasons.push('标题或技能标签明确为全职')
  }
  const wantsRemote = plan?.workModes?.includes('线上')
  if (
    wantsRemote &&
    /(坐班|到岗|线下办公|必须到场)/.test(titleText) &&
    !/(线上|远程)/.test(titleText)
  ) {
    reasons.push('标题或技能标签明确要求线下到岗')
  }
  const mustNotHave = plan?.mustNotHave ?? []
  for (const term of mustNotHave) {
    if (term.length >= 2 && titleText.includes(term)) {
      reasons.push(`标题或技能标签命中排除词：${term}`)
    }
  }
  return {
    reject: reasons.length > 0,
    reasons
  }
}
