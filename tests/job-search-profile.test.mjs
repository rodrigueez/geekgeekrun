import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyJobSearchProfileToBossConfig,
  captureJobSearchProfileConfig,
  createJobSearchProfile,
  normalizeJobSearchProfileFile,
  serializeJobSearchProfileList,
  summarizeJobSearchProfile
} from '../packages/geek-auto-start-chat-with-boss/job-search-profile.mjs'

const buildLiveConfig = () => ({
  bossConfig: {
    expectJobNameRegExpStr: 'SEO',
    expectCityList: ['广州'],
    jobSemanticFilterCriteria: '线上兼职 SEO',
    autoReminder: { rechatLimitDay: 21 },
    isSageTimeEnabled: true,
    jobSourcePerformanceEnabled: true,
    jobSourceList: [
      {
        type: 'search',
        enabled: true,
        children: [
          { enabled: true, keyword: 'SEO 兼职' },
          { enabled: false, keyword: '全职 SEO' }
        ]
      }
    ]
  },
  commonJobConditionConfig: {
    expectSalaryLow: 5,
    expectSalaryHigh: 15
  },
  targetCompanyList: ['示例公司'],
  resumeList: [{ name: '默认简历', content: { name: 'SEO 简历' } }]
})

test('captures only job-search fields and keeps shared settings out', () => {
  const captured = captureJobSearchProfileConfig(buildLiveConfig())

  assert.equal(captured.boss.expectJobNameRegExpStr, 'SEO')
  assert.deepEqual(captured.boss.expectCityList, ['广州'])
  assert.equal(captured.boss.jobSemanticFilterCriteria, '线上兼职 SEO')
  assert.equal(captured.boss.autoReminder, undefined)
  assert.equal(captured.boss.isSageTimeEnabled, undefined)
  assert.equal(captured.boss.jobSourcePerformanceEnabled, undefined)
  assert.deepEqual(captured.commonJobCondition, {
    expectSalaryLow: 5,
    expectSalaryHigh: 15
  })
  assert.deepEqual(captured.targetCompanyList, ['示例公司'])
  assert.equal(captured.resumeList.length, 1)
})

test('applies profile fields while preserving shared live settings', () => {
  const profile = createJobSearchProfile('线上 SEO', {
    boss: {
      expectJobNameRegExpStr: 'SEO',
      expectCityList: ['深圳']
    }
  })

  const nextBossConfig = applyJobSearchProfileToBossConfig(
    {
      expectJobNameRegExpStr: '前端',
      expectCityList: [],
      autoReminder: { rechatLimitDay: 30 },
      isSageTimeEnabled: false,
      sageTimeOpTimes: 120
    },
    profile
  )

  assert.equal(nextBossConfig.expectJobNameRegExpStr, 'SEO')
  assert.deepEqual(nextBossConfig.expectCityList, ['深圳'])
  assert.deepEqual(nextBossConfig.autoReminder, { rechatLimitDay: 30 })
  assert.equal(nextBossConfig.isSageTimeEnabled, false)
  assert.equal(nextBossConfig.sageTimeOpTimes, 120)
  assert.equal(nextBossConfig.jobSemanticFilterCriteria, undefined)
})

test('creates a default profile from the live config when the file is missing', () => {
  const profileFile = normalizeJobSearchProfileFile(null, buildLiveConfig())

  assert.equal(profileFile.profiles.length, 1)
  assert.equal(profileFile.profiles[0].name, '默认')
  assert.equal(profileFile.activeProfileId, profileFile.profiles[0].id)
  assert.equal(
    profileFile.profiles[0].config.boss.expectJobNameRegExpStr,
    'SEO'
  )
})

test('repairs a missing active profile id without dropping profiles', () => {
  const profileFile = normalizeJobSearchProfileFile({
    version: 1,
    activeProfileId: 'missing',
    profiles: [
      { id: 'a', name: '方案 A', config: {} },
      { id: 'b', name: '方案 B', config: {} }
    ]
  })

  assert.equal(profileFile.profiles.length, 2)
  assert.equal(profileFile.activeProfileId, 'a')
})

test('summarizes enabled search keywords and resume state', () => {
  const profile = createJobSearchProfile('线上 SEO', {
    boss: {
      expectCityList: ['广州'],
      jobSourceList: [
        {
          type: 'search',
          enabled: true,
          children: [
            { enabled: true, keyword: 'SEO 兼职' },
            { enabled: true, keyword: '远程 SEO' },
            { enabled: false, keyword: '全职 SEO' }
          ]
        }
      ]
    },
    resumeList: [{ name: '默认简历' }]
  })

  const summary = summarizeJobSearchProfile(profile)
  assert.deepEqual(summary.keywords, ['SEO 兼职', '远程 SEO'])
  assert.deepEqual(summary.cities, ['广州'])
  assert.equal(summary.hasResume, true)
  assert.match(summary.description, /SEO 兼职/)
})

test('uses the common city setting when the profile delegates city filtering', () => {
  const profile = createJobSearchProfile('线上 SEO', {
    boss: {
      fieldsForUseCommonConfig: { city: true },
      expectCityList: []
    },
    commonJobCondition: {
      expectCityList: ['广州', '深圳']
    }
  })

  assert.deepEqual(summarizeJobSearchProfile(profile).cities, ['广州', '深圳'])
})

test('serializes the list with the active marker', () => {
  const profileFile = {
    version: 1,
    activeProfileId: 'b',
    profiles: [
      createJobSearchProfile('A', {}, { id: 'a' }),
      createJobSearchProfile('B', {}, { id: 'b' })
    ]
  }

  const result = serializeJobSearchProfileList(profileFile)
  assert.equal(result.activeProfileId, 'b')
  assert.equal(result.profiles.find((it) => it.id === 'b').isActive, true)
  assert.equal(result.profiles.find((it) => it.id === 'a').isActive, false)
})
