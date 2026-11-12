import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildResumeProfile,
  combineMatchScores,
  getJobMatchInputHash,
  getResumeHash,
  normalizeMatchWeights,
  rankJobCandidates,
  scoreJobMatch
} from '../packages/geek-auto-start-chat-with-boss/job-match-score.mjs'

const resume = {
  content: {
    name: '张三',
    workYearDesc: '5年',
    expectJob: '前端开发工程师',
    userDescription: '熟悉 Vue、TypeScript、Node.js，负责过大型后台系统。',
    geekWorkExpList: [
      {
        company: 'Example',
        positionName: '高级前端开发工程师',
        workDescription: '使用 Vue3 和 TypeScript 开发管理后台。',
        performance: '首屏性能提升 40%。'
      }
    ],
    geekProjExpList: [
      {
        name: '数据平台',
        roleName: '前端负责人',
        projectDescription: 'Node.js 服务与可视化页面。',
        performance: '服务 10 万用户。'
      }
    ]
  }
}

test('buildResumeProfile marks a normal resume as usable', () => {
  const profile = buildResumeProfile(resume)
  assert.equal(profile.isUsable, true)
  assert.match(profile.normalizedText, /vue/)
  assert.match(profile.normalizedText, /前端开发工程师/)
})

test('scores a matching job above a mismatching job', () => {
  const profile = buildResumeProfile(resume)
  const matching = scoreJobMatch(
    {
      jobName: '前端开发工程师',
      positionName: 'Vue 前端',
      showSkills: ['Vue', 'TypeScript', 'Node.js'],
      salaryDesc: '25-35K',
      jobExperience: '3-5年',
      brandName: 'Example',
      bossActiveTimeDesc: '今日活跃'
    },
    profile,
    {
      salarySuit: true,
      experienceSuit: true,
      companyPreferred: true
    }
  )
  const mismatching = scoreJobMatch(
    {
      jobName: '会计',
      positionName: '财务主管',
      showSkills: ['财务报表', '税务筹划'],
      salaryDesc: '8-10K',
      jobExperience: '10年以上',
      brandName: 'Other',
      bossActiveTimeDesc: '半年前活跃'
    },
    profile,
    {
      salarySuit: false,
      experienceSuit: false,
      companyPreferred: false
    }
  )
  assert.ok(matching.score > mismatching.score)
  assert.ok(matching.score >= 70)
})

test('ranks eligible candidates by score and keeps original order without resume', () => {
  const profile = buildResumeProfile(resume)
  const jobs = [
    { encryptJobId: 'low', jobName: '会计', showSkills: ['税务'] },
    { encryptJobId: 'high', jobName: '前端开发工程师', showSkills: ['Vue', 'TypeScript'] }
  ]
  const ranked = rankJobCandidates(jobs, { profile })
  assert.equal(ranked[0].job.encryptJobId, 'high')

  const fallback = rankJobCandidates(jobs, {
    profile: buildResumeProfile(null)
  })
  assert.deepEqual(
    fallback.map((item) => item.index),
    [0, 1]
  )
})

test('normalizes invalid weight values', () => {
  assert.deepEqual(normalizeMatchWeights({ title: 40, skills: -1, salary: '20' }), {
    title: 40,
    skills: 35,
    salary: 20,
    experience: 10,
    company: 10,
    activity: 5
  })
})

test('combines deterministic and LLM scores with a bounded weight', () => {
  assert.equal(combineMatchScores(80, 60, 0.3), 74)
  assert.equal(combineMatchScores(80, NaN, 0.3), 80)
  assert.equal(combineMatchScores(80, 100, 2), 100)
})

test('builds stable resume and job hashes', () => {
  const profile = buildResumeProfile(resume)
  assert.equal(getResumeHash(profile), getResumeHash(profile))
  assert.equal(
    getJobMatchInputHash({ jobName: '前端', showSkills: ['Vue'] }),
    getJobMatchInputHash({ jobName: '前端', showSkills: ['Vue'] })
  )
  assert.notEqual(
    getJobMatchInputHash({ jobName: '前端' }),
    getJobMatchInputHash({ jobName: '后端' })
  )
})
