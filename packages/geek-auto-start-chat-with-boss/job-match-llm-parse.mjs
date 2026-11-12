const MAX_RESUME_CHARS = 6000
const MAX_JOB_DESCRIPTION_CHARS = 3000

function truncate(value, maxLength) {
  const text = String(value ?? '').trim()
  return text.length > maxLength ? `${text.slice(0, maxLength)}\n[已截断]` : text
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

export function getBaseURLFromCompleteApiUrl(url) {
  return normalizeText(url)
    .replace(/\/chat\/completions\/?$/i, '')
    .replace(/\/responses\/?$/i, '')
    .replace(/\/completions\/?$/i, '')
}

export function pickJobMatchLlmConfig(configList) {
  const enabled = (Array.isArray(configList) ? configList : []).filter(
    (item) =>
      item?.enabled !== false &&
      getBaseURLFromCompleteApiUrl(item?.providerCompleteApiUrl) &&
      normalizeText(item?.model)
  )
  if (!enabled.length) {
    return null
  }
  const weighted = []
  for (const item of enabled) {
    const weight = Math.max(0, Number(item.serveWeight) || 1)
    for (let i = 0; i < Math.min(Math.ceil(weight), 100); i++) {
      weighted.push(item)
    }
  }
  return weighted[Math.floor(Math.random() * weighted.length)] ?? enabled[0]
}

export function buildJobMatchMessages({ resumeText, job, deterministicScore }) {
  const jobInfo = job?.jobInfo ?? job ?? {}
  const bossInfo = job?.bossInfo ?? job ?? {}
  const skills =
    jobInfo.showSkills ??
    jobInfo.skills ??
    job?.showSkills ??
    job?.skills ??
    job?.jobLabels ??
    []
  return [
    {
      role: 'system',
      content:
        '你是求职匹配评估器。只输出 JSON，不要解释 JSON 之外的文字。' +
        'JSON 格式为 {"score": 0到100的整数, "reasons": ["不超过3条理由"]}。' +
        '重点判断候选人的真实经历能否胜任职位，不要因为薪资或城市等硬条件重复加减分。'
    },
    {
      role: 'user',
      content: [
        '## 简历',
        truncate(resumeText, MAX_RESUME_CHARS),
        '',
        '## 职位',
        `职位名：${normalizeText(jobInfo.jobName ?? job?.jobName)}`,
        `岗位方向：${normalizeText(jobInfo.positionName ?? job?.positionName)}`,
        `技能标签：${(Array.isArray(skills) ? skills : [skills]).map((item) => normalizeText(item?.name ?? item?.text ?? item)).filter(Boolean).join('、')}`,
        `招聘者活跃度：${normalizeText(bossInfo.activeTimeDesc ?? job?.bossActiveTimeDesc ?? job?.activeTimeDesc)}`,
        '',
        '职位描述：',
        truncate(
          jobInfo.postDescription ?? job?.postDescription ?? job?.description,
          MAX_JOB_DESCRIPTION_CHARS
        ),
        '',
        `规则评分参考：${deterministicScore}`
      ].join('\n')
    }
  ]
}

export function parseJobMatchResponse(content) {
  const raw = normalizeText(content)
  const withoutFence = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  let parsed
  try {
    parsed = JSON.parse(withoutFence)
  } catch {
    const start = withoutFence.indexOf('{')
    const end = withoutFence.lastIndexOf('}')
    if (start < 0 || end <= start) {
      throw new Error('LLM 没有返回合法 JSON')
    }
    parsed = JSON.parse(withoutFence.slice(start, end + 1))
  }
  const score = Number(parsed?.score)
  if (!Number.isFinite(score)) {
    throw new Error('LLM 返回结果缺少有效 score')
  }
  return {
    score: Math.round(Math.min(Math.max(score, 0), 100)),
    reasons: (Array.isArray(parsed?.reasons) ? parsed.reasons : [])
      .map((item) => normalizeText(item))
      .filter(Boolean)
      .slice(0, 3)
  }
}
