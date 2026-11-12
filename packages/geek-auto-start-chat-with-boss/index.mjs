import {
  sleep,
  sleepWithRandomDelay
} from '@geekgeekrun/utils/sleep.mjs'

import fs from 'node:fs'
import os from 'node:os'
import { get__dirname } from '@geekgeekrun/utils/legacy-path.mjs';
import path from 'node:path';
import JSON5 from 'json5'
import { EventEmitter } from 'node:events'
import { setDomainLocalStorage } from '@geekgeekrun/utils/puppeteer/local-storage.mjs'

import { readConfigFile, writeStorageFile, ensureConfigFileExist, readStorageFile, ensureStorageFileExist } from './runtime-file-utils.mjs'
import {
  combineFiltersWithConstraintsGenerator,
  checkAnyCombineBossRecommendFilterHasCondition,
  formatStaticCombineFilters,
  getFilterConditionKey,
  isFilterConditionEmpty,
} from './combineCalculator.mjs'
import { getJobListSkipReason } from './job-list-prefilter.mjs'
import {
  getJobSourceKey,
  rotateListToKey,
  findCheckpointBySourceKey
} from './job-traversal.mjs'
import {
  buildResumeProfile,
  normalizeMatchWeights,
  rankJobCandidates,
  scoreJobMatch,
  getResumeHash,
  getJobMatchInputHash,
  combineMatchScores
} from './job-match-score.mjs'
import {
  pickJobFilterLlmConfig,
  pickJobFilterPlanLlmConfig,
  pickJobMatchLlmConfig,
  requestJobMatchScore
} from './job-match-llm.mjs'
import {
  buildPerformanceMaps,
  sortSourcesByPerformance,
  sortFiltersByPerformance
} from './job-source-performance.mjs'
import { buildJobCandidateRecord } from './job-candidate.mjs'
import {
  getRecommendEntryActive,
  getExpectEntryActive,
  getSearchQuery,
  getExpectJobList,
  waitForJobListIdle,
  getPageQuery,
  getJobList,
  getHasMore,
  scrollJobIntoView,
  getJobDetail,
  getCurrentJob,
  getStartChatButtonHtml,
  getStartChatButton,
  getNotSuitableButton
} from './page-adapter/boss-page.mjs'
import { normalizeJobSourceList } from './job-source.mjs'
import { handleChatAddFriendResponse } from './chat-startup.mjs'
import { testIfJobTitleOrDescriptionSuit } from './job-detail.mjs'
import { setFilterCondition } from './job-filter.mjs'
import { findConditionByStrategy } from './not-suit-strategy.mjs'
import {
  buildFallbackJobFilterPlan,
  evaluatePlanHardReject,
  getCriteriaHash,
  getJobSemanticInputHash
} from './job-filter-agent-parse.mjs'
import {
  requestJobFilterPlan,
  requestJobSemanticFilter
} from './job-filter-agent.mjs'
import { default as jobFilterConditions } from './internal-config/job-filter-conditions-20241002.json'
import { default as rawIndustryFilterExemption } from './internal-config/job-filter-industry-filter-exemption-20241002.json'
import { ChatStartupFrom } from '@geekgeekrun/sqlite-plugin/dist/entity/ChatStartupLog'
import {
  MarkAsNotSuitReason,
  MarkAsNotSuitOp,
  StrategyScopeOptionWhenMarkJobNotMatch,
  SalaryCalculateWay,
  JobDetailRegExpMatchLogic,
  JobSource,
  CombineRecommendJobFilterType,
  JobFunnelEventType,
  JobMatchScorerType
} from '@geekgeekrun/sqlite-plugin/dist/enums'
import {
  activeDescList,
  RECOMMEND_JOB_ENTRY_SELECTOR,
  USER_SET_EXPECT_JOB_ENTRIES_SELECTOR,
  SEARCH_BOX_SELECTOR,
} from './constant.mjs'
import { parseSalary } from "@geekgeekrun/sqlite-plugin/dist/utils/parser"
import { waitForSageTimeOrJustContinue } from './sage-time.mjs'
import cityGroupData from './cityGroup.mjs'
import { hasIntersection } from '@geekgeekrun/utils/number.mjs';
const flattedCityList = []
;(cityGroupData?.zpData?.cityGroup ?? []).forEach(it => {
  const firstChar = it.firstChar
  it.cityList.forEach(city => {
    flattedCityList.push({
      ...city,
      firstChar
    })
  })
})

const jobFilterConditionsMapByCode = {}
Object.values(jobFilterConditions).forEach(arr => {
  arr.forEach(option => {
    jobFilterConditionsMapByCode[option.code] = option
  })
})

let industryFilterCursorIndex = 0;
const industryFilterExemption = JSON.parse(JSON.stringify(rawIndustryFilterExemption))
const industryFilterConditionsMapByIndex = {}
const industryFilterConditionsMapByCode = {}
const industryFilterConditionCodeToIndexMap = {}
industryFilterExemption.forEach(item => {
  if (!Array.isArray(item.subLevelModelList)) {
    return
  }
  item.subLevelModelList.forEach(option => {
    industryFilterConditionsMapByCode[option.code] = option
    industryFilterConditionsMapByIndex[industryFilterCursorIndex] = option
    industryFilterConditionCodeToIndexMap[option.code] = industryFilterCursorIndex
    industryFilterCursorIndex++
  })
})

ensureConfigFileExist()
ensureStorageFileExist()

const isUiDev = process.env.NODE_ENV === 'development'
export const autoStartChatEventBus = new EventEmitter()

/**
 * @type { import("puppeteer") }
 */
let puppeteer
let StealthPlugin
let LaodengPlugin
let AnonymizeUaPlugin
export async function initPuppeteer () {
  // production
  const importResult = await Promise.all(
    [
      import('puppeteer-extra'),
      import('puppeteer-extra-plugin-stealth'),
      import('@geekgeekrun/puppeteer-extra-plugin-laodeng'),
      import('puppeteer-extra-plugin-anonymize-ua')
    ]
  )
  puppeteer = importResult[0].default
  StealthPlugin = importResult[1].default
  LaodengPlugin = importResult[2].default
  AnonymizeUaPlugin = importResult[3].default
  puppeteer.use(StealthPlugin())
  puppeteer.use(LaodengPlugin())
  puppeteer.use(AnonymizeUaPlugin({ makeWindows: false }))
  return {
    puppeteer,
    StealthPlugin,
    LaodengPlugin,
    AnonymizeUaPlugin
  }
}

const commonJobConditionConfig = readConfigFile('common-job-condition-config.json')
const fieldsForUseCommonConfig = readConfigFile('boss.json').fieldsForUseCommonConfig ?? {}

const targetCompanyList = (
  !fieldsForUseCommonConfig.expectCompanies ?
    readConfigFile('target-company-list.json')
    :
    commonJobConditionConfig.expectCompanies
).filter(it => !!it.trim());
const combineRecommendJobFilterType = readConfigFile('boss.json').combineRecommendJobFilterType ?? CombineRecommendJobFilterType.ANY_COMBINE

const anyCombineRecommendJobFilter = readConfigFile('boss.json').anyCombineRecommendJobFilter
const staticCombineRecommendJobFilterConditions = readConfigFile('boss.json').staticCombineRecommendJobFilterConditions ?? []
let isSkipEmptyConditionForCombineRecommendJobFilter = readConfigFile('boss.json').isSkipEmptyConditionForCombineRecommendJobFilter
const maxRecommendJobFilterCombinations = (() => {
  const value = Number(readConfigFile('boss.json').maxRecommendJobFilterCombinations)
  if (!Number.isFinite(value) || value < 1) {
    return 500
  }
  return Math.floor(Math.min(value, 5000))
})()
const jobMatchEnabled = readConfigFile('boss.json').jobMatchEnabled ?? true
const jobMatchMinScore = (() => {
  const value = Number(readConfigFile('boss.json').jobMatchMinScore)
  if (!Number.isFinite(value) || value < 0) {
    return 0
  }
  return Math.min(Math.floor(value), 100)
})()
const jobMatchWeights = normalizeMatchWeights(
  readConfigFile('boss.json').jobMatchWeights
)
const resumeProfile = buildResumeProfile(readConfigFile('resumes.json')?.[0])
const isJobMatchScoringEnabled = jobMatchEnabled && resumeProfile.isUsable
const jobMatchLlmEnabled = readConfigFile('boss.json').jobMatchLlmEnabled ?? false
const jobMatchLlmTopN = (() => {
  const value = Number(readConfigFile('boss.json').jobMatchLlmTopN)
  if (!Number.isFinite(value) || value < 0) {
    return 3
  }
  return Math.min(Math.floor(value), 20)
})()
const jobMatchLlmMaxCallsPerRun = (() => {
  const value = Number(readConfigFile('boss.json').jobMatchLlmMaxCallsPerRun)
  if (!Number.isFinite(value) || value < 0) {
    return 20
  }
  return Math.min(Math.floor(value), 500)
})()
const jobMatchLlmWeight = 0.3
const llmConfigList = readConfigFile('llm.json')
const jobMatchLlmConfig = pickJobMatchLlmConfig(llmConfigList)
const jobMatchLlmModelId = jobMatchLlmConfig?.model ?? ''
const jobFilterPlanLlmConfig = pickJobFilterPlanLlmConfig(llmConfigList)
const jobSemanticLlmConfig = pickJobFilterLlmConfig(llmConfigList)
const jobSemanticLlmModelId = jobSemanticLlmConfig?.model ?? ''
const isJobMatchLlmScoringEnabled =
  jobMatchLlmEnabled &&
  isJobMatchScoringEnabled &&
  jobMatchLlmTopN > 0 &&
  jobMatchLlmMaxCallsPerRun > 0 &&
  Boolean(jobMatchLlmConfig)
const resumeHash = getResumeHash(resumeProfile)
const jobSemanticFilterEnabled =
  readConfigFile('boss.json').jobSemanticFilterEnabled ?? false
const jobSemanticFilterCriteria =
  String(readConfigFile('boss.json').jobSemanticFilterCriteria ?? '').trim()
const jobSemanticFilterListPrecheck =
  readConfigFile('boss.json').jobSemanticFilterListPrecheck ?? true
const jobSemanticFilterTopN = (() => {
  const value = Number(readConfigFile('boss.json').jobSemanticFilterTopN)
  if (!Number.isFinite(value) || value < 1) {
    return 5
  }
  return Math.min(Math.floor(value), 20)
})()
const jobSemanticFilterMaxCallsPerRun = (() => {
  const value = Number(readConfigFile('boss.json').jobSemanticFilterMaxCallsPerRun)
  if (!Number.isFinite(value) || value < 1) {
    return 20
  }
  return Math.min(Math.floor(value), 500)
})()
const jobSemanticFilterMinConfidence = (() => {
  const value = Number(readConfigFile('boss.json').jobSemanticFilterMinConfidence)
  if (!Number.isFinite(value)) {
    return 0.6
  }
  return Math.min(Math.max(value, 0), 1)
})()
const jobSemanticCriteriaHash = getCriteriaHash(jobSemanticFilterCriteria)
const isJobSemanticFilterEnabled =
  jobSemanticFilterEnabled &&
  Boolean(jobSemanticFilterCriteria) &&
  Boolean(jobSemanticLlmConfig)
const jobSourcePerformanceEnabled =
  readConfigFile('boss.json').jobSourcePerformanceEnabled ?? true
const jobSourcePerformanceMinChats = (() => {
  const value = Number(readConfigFile('boss.json').jobSourcePerformanceMinChats)
  if (!Number.isFinite(value) || value < 1) {
    return 10
  }
  return Math.min(Math.floor(value), 1000)
})()
if (!checkAnyCombineBossRecommendFilterHasCondition(anyCombineRecommendJobFilter)) {
  isSkipEmptyConditionForCombineRecommendJobFilter = false
}
const hasAnyCombineRecommendJobFilter = checkAnyCombineBossRecommendFilterHasCondition(
  anyCombineRecommendJobFilter
)
const expectJobRegExpStr = readConfigFile('boss.json').expectJobRegExpStr
const jobCollectionOnly = readConfigFile('boss.json').jobCollectionOnly === true
const jobTypeList = (() => {
  const raw = readConfigFile('boss.json').jobTypeList
  if (!Array.isArray(raw)) {
    return []
  }
  return raw
    .map((item) => Number(item))
    .filter((item) => [0, 4, 6].includes(item))
})()
const activeJobSearchProfileId = (() => {
  try {
    return readConfigFile('job-search-profiles.json')?.activeProfileId ?? ''
  } catch {
    return ''
  }
})()
const normalizeMarkStrategy = (strategy) =>
  jobCollectionOnly && strategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS
    ? MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL
    : strategy
const jobNotMatchStrategy = normalizeMarkStrategy(
  readConfigFile('boss.json').jobNotMatchStrategy ?? MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS
)

const expectCityNotMatchStrategy = normalizeMarkStrategy(
  readConfigFile('boss.json').expectCityNotMatchStrategy ?? MarkAsNotSuitOp.NO_OP
)
const expectCityList = (
  !fieldsForUseCommonConfig.city ?
    readConfigFile('boss.json').expectCityList
    :
    commonJobConditionConfig.expectCityList
) ?? []

const strategyScopeOptionWhenMarkJobCityNotMatch = readConfigFile('boss.json').strategyScopeOptionWhenMarkJobCityNotMatch ?? StrategyScopeOptionWhenMarkJobNotMatch.ONLY_COMPANY_MATCHED_JOB

// salary
const expectSalaryLow = parseFloat(
  !fieldsForUseCommonConfig.salary ? 
    readConfigFile('boss.json').expectSalaryLow
    :
    commonJobConditionConfig.expectSalaryLow
) || null
const expectSalaryHigh = parseFloat(
  !fieldsForUseCommonConfig.salary ? 
    readConfigFile('boss.json').expectSalaryHigh
    :
    commonJobConditionConfig.expectSalaryHigh
) || null
const expectSalaryCalculateWay = (
  !fieldsForUseCommonConfig.salary ?
    readConfigFile('boss.json').expectSalaryCalculateWay
    :
    commonJobConditionConfig.expectSalaryCalculateWay
) ?? SalaryCalculateWay.MONTH_SALARY
const expectSalaryNotMatchStrategy = normalizeMarkStrategy(
  readConfigFile('boss.json').expectSalaryNotMatchStrategy ?? MarkAsNotSuitOp.NO_OP
)
const isSalaryFilterEnabled = expectSalaryLow || expectSalaryHigh
const strategyScopeOptionWhenMarkSalaryNotMatch = readConfigFile('boss.json').strategyScopeOptionWhenMarkSalaryNotMatch ?? StrategyScopeOptionWhenMarkJobNotMatch.ONLY_COMPANY_MATCHED_JOB

// work exp
let expectWorkExpList = readConfigFile('boss.json').expectWorkExpList ?? []
const expectWorkExpListSet = new Set(expectWorkExpList)
if (
  expectWorkExpListSet.has('应届生') ||
  expectWorkExpListSet.has('在校生')
) {
  expectWorkExpListSet.delete('应届生')
  expectWorkExpListSet.delete('在校生')
  expectWorkExpListSet.add('在校/应届')
}
expectWorkExpList = Array.from(expectWorkExpListSet)

const expectWorkExpNotMatchStrategy = normalizeMarkStrategy(
  readConfigFile('boss.json').expectWorkExpNotMatchStrategy ?? MarkAsNotSuitOp.NO_OP
)
const strategyScopeOptionWhenMarkJobWorkExpNotMatch = readConfigFile('boss.json').strategyScopeOptionWhenMarkJobWorkExpNotMatch ?? StrategyScopeOptionWhenMarkJobNotMatch.ONLY_COMPANY_MATCHED_JOB

let jobDetailRegExpMatchLogic = (
  !fieldsForUseCommonConfig.jobDetail ?
    readConfigFile('boss.json').jobDetailRegExpMatchLogic
    :
    commonJobConditionConfig.jobDetailRegExpMatchLogic
) ?? JobDetailRegExpMatchLogic.EVERY

const markAsNotActiveSelectedTimeRange = (() => {
  let n = readConfigFile('boss.json').markAsNotActiveSelectedTimeRange
  if (
    typeof n !== 'number' || isNaN(parseInt(n)) || n >= activeDescList.length || n < 0
  ) {
    n = 7
  }
  return n
})()
const jobNotActiveStrategy = (() => {
  let value = readConfigFile('boss.json').jobNotActiveStrategy ?? MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS
  if (markAsNotActiveSelectedTimeRange === 0) {
    value = MarkAsNotSuitOp.NO_OP
  }
  return normalizeMarkStrategy(value)
})()

let {
  expectJobNameRegExpStr,
  expectJobTypeRegExpStr,
  expectJobDescRegExpStr,
} = !fieldsForUseCommonConfig.jobDetail ? readConfigFile('boss.json') : commonJobConditionConfig
if (
  !fieldsForUseCommonConfig.jobDetail &&
  expectJobRegExpStr &&
  !expectJobNameRegExpStr &&
  !expectJobTypeRegExpStr &&
  !expectJobDescRegExpStr
) {
  expectJobNameRegExpStr = expectJobRegExpStr
  expectJobTypeRegExpStr = expectJobRegExpStr
  expectJobDescRegExpStr = expectJobRegExpStr
}

if (
  [
    expectJobNameRegExpStr,
    expectJobTypeRegExpStr,
    expectJobDescRegExpStr,
  ].map(it => Boolean(it?.trim())).every(it => !it)
) {
  jobDetailRegExpMatchLogic = JobDetailRegExpMatchLogic.EVERY
}

const normalizedJobSource = normalizeJobSourceList(
  readConfigFile('boss.json').jobSourceList
)
const localStoragePageUrl = `https://www.zhipin.com/desktop/`
const recommendJobPageUrl = `https://www.zhipin.com/web/geek/jobs`

const expectCompanySet = new Set(targetCompanyList)
const enableCompanyAllowList = Boolean(expectCompanySet.size)
const blockCompanyNameRegExpStr = (
  !fieldsForUseCommonConfig.blockCompanyNameRegExpStr ?
    readConfigFile('boss.json').blockCompanyNameRegExpStr
    :
    commonJobConditionConfig.blockCompanyNameRegExpStr
) ?? ''
const blockCompanyNameRegExp = (() => {
  if (!blockCompanyNameRegExpStr?.trim()) {
    return null
  }
  try {
    return new RegExp(blockCompanyNameRegExpStr, 'im')
  }
  catch {
    return null
  }
})()
const blockCompanyNameRegMatchStrategy = normalizeMarkStrategy(
  readConfigFile('boss.json').blockCompanyNameRegMatchStrategy ?? MarkAsNotSuitOp.NO_OP
)

/**
 * @type { import('puppeteer').Browser }
 */
let browser
/**
 * @type { import('puppeteer').Page }
 */
let page

const blockBossNotNewChat = new Set()
const blockBossNotActive = new Set()
const blockJobNotSuit = new Set()
const blockJobNotHiring = new Set()

function checkIfSalarySuit(salaryDesc) {
  const salaryData = parseSalary(salaryDesc)
  if (expectSalaryCalculateWay === SalaryCalculateWay.MONTH_SALARY) {
    let ourSalaryInterval = [expectSalaryLow ?? null, expectSalaryHigh ?? null]
    if (ourSalaryInterval.every(it => !isNaN(parseFloat(it)))) {
      ourSalaryInterval = ourSalaryInterval.sort((a, b) => a - b)
    }
    const theirSalaryInterval = [salaryData.low ?? null, salaryData.high ?? null]
    return hasIntersection(theirSalaryInterval, ourSalaryInterval)
  }
  else if (expectSalaryCalculateWay === SalaryCalculateWay.ANNUAL_PACKAGE) {
    const salaryDataMonth = salaryData.month || 12
    let ourSalaryInterval = [expectSalaryLow ?? null, expectSalaryHigh ?? null]
    if (ourSalaryInterval.every(it => !isNaN(parseFloat(it)))) {
      ourSalaryInterval = ourSalaryInterval.sort((a, b) => a - b)
    }
    const theirSalaryInterval = [salaryData.low ?? null, salaryData.high ?? null].map(
      it =>
        it === null ? null : (it * salaryDataMonth / 10)
    )
    return hasIntersection(theirSalaryInterval, ourSalaryInterval)
  }
  return true
}

function getJobMatchOptionsForListJob(job) {
  return {
    salarySuit: isSalaryFilterEnabled ? checkIfSalarySuit(job.salaryDesc) : null,
    experienceSuit: expectWorkExpList.length
      ? expectWorkExpList.includes(job.jobExperience)
      : null,
    companyPreferred: enableCompanyAllowList
      ? [...expectCompanySet].some(
          (name) => job.brandName?.toLowerCase?.()?.includes(name.toLowerCase())
        )
      : null
  }
}

function getJobMatchOptionsForDetailJob(selectedJobData) {
  return {
    salarySuit: isSalaryFilterEnabled
      ? checkIfSalarySuit(selectedJobData?.salaryDesc)
      : null,
    experienceSuit: expectWorkExpList.length
      ? expectWorkExpList.includes(selectedJobData?.jobExperience)
      : null,
    companyPreferred: enableCompanyAllowList
      ? [...expectCompanySet].some(
          (name) => selectedJobData?.brandName?.toLowerCase?.()?.includes(name.toLowerCase())
        )
      : null
  }
}

async function markJobAsNotSuitInRecommendPage (reasonCode) {
  /**
   * @type {{chosenReasonInUi?: { code: number, text: string}}}
   */
  const result = {}
  const notSuitableFeedbackButtonProxy = await getNotSuitableButton(page)
  if (notSuitableFeedbackButtonProxy) {
    await notSuitableFeedbackButtonProxy.evaluate(el => {
      el.scrollIntoView({
        block: 'center'
      })
    })
    await sleep(200)
    await notSuitableFeedbackButtonProxy.click()
    const rawReasonResData = (await (await page.waitForResponse(
      response => {
        if (
          response.url().startsWith('https://www.zhipin.com/wapi/zpgeek/negativefeedback/reasons.json')
        ) {
          return true
        }
        return false
      }
    )).json())?.zpData?.result ?? [];
    const reasonCodeToTextMap = await readStorageFile('job-not-suit-reason-code-to-text-cache.json')
    for(const it of rawReasonResData) {
      reasonCodeToTextMap[it.code] = it.text?.content ?? ''
    }
    await writeStorageFile('job-not-suit-reason-code-to-text-cache.json', reasonCodeToTextMap)
    await sleepWithRandomDelay(2000)
    const chooseReasonDialogProxy = await(async() => {
      const alls = await page.$$('.zp-dialog-wrap.zp-feedback-dialog')
      return alls?.[alls.length - 1]
    })()
    let isOptionChosen = false
    if (chooseReasonDialogProxy) {
      switch (reasonCode) {
        case MarkAsNotSuitReason.COMPANY_NAME_NOT_SUIT: {
          const opProxy = (await chooseReasonDialogProxy.$(`.zp-type-item[title*="公司"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title="面试过/入职过"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title="重复推荐"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title*="距离"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title*="薪资"]`))
          if (opProxy) {
            await opProxy.click()
            isOptionChosen = true
          }
          break
        }
        case MarkAsNotSuitReason.BOSS_INACTIVE: {
          const opProxy = (await chooseReasonDialogProxy.$(`.zp-type-item[title="BOSS活跃度低"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title="职位停招/招满"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title="面试过/入职过"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title="重复推荐"]`))
          if (opProxy) {
            await opProxy.click()
            isOptionChosen = true
          }
          break
        }
        case MarkAsNotSuitReason.JOB_WORK_EXP_NOT_SUIT:
        case MarkAsNotSuitReason.JOB_CITY_NOT_SUIT: {
          const opProxy = (await chooseReasonDialogProxy.$(`.zp-type-item[title$="城市"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title*="距离"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title*="公司"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title="面试过/入职过"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title="重复推荐"]`))
          if (opProxy) {
            await opProxy.click()
            isOptionChosen = true
          }
          break
        }
        case MarkAsNotSuitReason.JOB_SALARY_NOT_SUIT: {
          const opProxy = (await chooseReasonDialogProxy.$(`.zp-type-item[title*="薪资"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title$="城市"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title*="距离"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title*="公司"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title="面试过/入职过"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title="重复推荐"]`))
          if (opProxy) {
            await opProxy.click()
            isOptionChosen = true
          }
          break
        }
        case MarkAsNotSuitReason.JOB_NOT_SUIT:
        default: {
          const opProxy = (await chooseReasonDialogProxy.$(`.zp-type-item[title$="职位"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title="面试过/入职过"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title="重复推荐"]`))
          if (opProxy) {
            await opProxy.click()
            isOptionChosen = true
          }
          break
        }
      }

      if (isOptionChosen) {
        await sleepWithRandomDelay(1500)
        const confirmButtonProxy = await chooseReasonDialogProxy.$(`.zp-dialog-footer .zp-btn.zp-btn-sure`)
        await confirmButtonProxy.click()
        const response = await page.waitForResponse(
          response => {
            if (
              response.url().startsWith('https://www.zhipin.com/wapi/zpgeek/negativefeedback/save.json')
            ) {
              return true
            }
            return false
          }
        )
        /**
         * scene=4&code=41&feedbackReason=&securityId=
         */
        const requestBody = response.request().postData()
        const chosenCode = Number(new URLSearchParams(requestBody).get('code'))
        if (chosenCode) {
          result.chosenReasonInUi = {
            code: chosenCode,
            text: reasonCodeToTextMap[chosenCode]
          }
        }
      } else {
        const cancelButtonProxy = await chooseReasonDialogProxy.$(`.zp-close`)
        await cancelButtonProxy.click()
      }

      await sleepWithRandomDelay(2500)
    }
  }
  return result
}

async function toRecommendPage (hooks) {
  let userInfoPromise = page.waitForResponse((response) => {
      if (response.url().startsWith('https://www.zhipin.com/wapi/zpuser/wap/getUserInfo.json')) {
        return true
      }
      return false
    }, { timeout: 120 * 1000 }).then((res) => {
      return res.json()
    })
  page.goto(recommendJobPageUrl, { timeout: 1 * 1000 }).catch(e => { void e })
  await sleep(3000)
  await page.waitForFunction(() => {
    return document.readyState === 'complete'
  }, { timeout: 120 * 1000 })
  if (
    page.url().startsWith('https://www.zhipin.com/web/common/403.html') ||
    page.url().startsWith('https://www.zhipin.com/web/common/error.html')
  ) {
    throw new Error("ACCESS_IS_DENIED")
  }

  await page.waitForFunction(({ recommendJobPageUrl }) => {
    return location.href.startsWith(recommendJobPageUrl) && document.readyState === 'complete'
  }, undefined, { recommendJobPageUrl })

  hooks.pageLoaded?.call()

  let userInfoResponse = await userInfoPromise
  await hooks.userInfoResponse?.promise({ userInfoResponse, browser })
  if (userInfoResponse?.code !== 0) {
    autoStartChatEventBus.emit('LOGIN_STATUS_INVALID', {
      userInfoResponse
    })
    writeStorageFile('boss-cookies.json', [])
    throw new Error("LOGIN_STATUS_INVALID")
  } else {
    await storeStorage(page).catch(() => void 0)
  }

  const traversalState = {
    encryptUserId: userInfoResponse?.zpData?.encryptUserId ?? null,
    checkpoints: [],
    processedJobIds: new Set(),
    performanceRows: []
  }
  await hooks.jobTraversalStateLoaded?.promise?.(
    traversalState.encryptUserId,
    traversalState
  )

  const computedSourceList = []
  for (const source of normalizedJobSource) {
    switch (source.type) {
      case 'recommend': {
        computedSourceList.push({
          type: source.type,
          selector: RECOMMEND_JOB_ENTRY_SELECTOR,
          async getIsCurrentActiveSource () {
            return getRecommendEntryActive(page, RECOMMEND_JOB_ENTRY_SELECTOR)
          },
          async setToActiveSource() {
            // not first navigation and should choose a job (except job)
            // click first expect job
            const expectJobTabHandler = await page.$(RECOMMEND_JOB_ENTRY_SELECTOR)
            await expectJobTabHandler.click() // switch to first condition
          }
        })
        continue
      }
      case 'expect': {
        await page.waitForSelector(USER_SET_EXPECT_JOB_ENTRIES_SELECTOR)
        const allExpectJobEntryHandles = await page.$$(USER_SET_EXPECT_JOB_ENTRIES_SELECTOR)
        allExpectJobEntryHandles.forEach((it, index) => {
          computedSourceList.push({
            type: source.type,
            index,
            selector: `${USER_SET_EXPECT_JOB_ENTRIES_SELECTOR}:nth-child(${index + 1})`,
            async getIsCurrentActiveSource () {
              return getExpectEntryActive(
                page,
                USER_SET_EXPECT_JOB_ENTRIES_SELECTOR,
                index
              )
            },
            async setToActiveSource() {
              // not first navigation and should choose a job (except job)
              // click first expect job
              const expectJobTabHandler = await page.$(`${USER_SET_EXPECT_JOB_ENTRIES_SELECTOR}:nth-child(${index + 1})`)
              await expectJobTabHandler.click() // switch to first condition
            }
          })
        })
        break
      }
      case 'search': {
        computedSourceList.push({
          type: source.type,
          keyword: source.keyword,
          async getIsCurrentActiveSource () {
            const currentKeyWord = await getSearchQuery(page)
            if (!currentKeyWord) {
              return false
            }
            return currentKeyWord === source.keyword
          },
          async setToActiveSource() {
            await page.waitForSelector(SEARCH_BOX_SELECTOR)
            const inputHandle = await page.$(`${SEARCH_BOX_SELECTOR} input`)
            await inputHandle.focus()
            await sleep(100)
            let currentValue = await inputHandle.evaluate(el => el.value)
            while (currentValue) {
              await inputHandle.press('Backspace')
              currentValue = await inputHandle.evaluate(el => el.value)
            }
            await inputHandle.type(source.keyword?.trim() || '', { delay: 100 })
            await sleep(500)
            await inputHandle.press('Enter')
          }
        })
      }
    }
  }

  computedSourceList.forEach((source, index) => {
    source.sourceKey = getJobSourceKey(source, index)
  })

  const performanceMaps = jobSourcePerformanceEnabled
    ? buildPerformanceMaps(traversalState.performanceRows, {
        minChats: jobSourcePerformanceMinChats
      })
    : null
  const checkpointSourceKey = traversalState.checkpoints?.[0]?.sourceKey
  const checkpointSource = findCheckpointBySourceKey(
    traversalState.checkpoints,
    checkpointSourceKey
  )
  const performanceOrderedSourceList = performanceMaps
    ? sortSourcesByPerformance(computedSourceList, performanceMaps)
    : computedSourceList
  const orderedSourceList = rotateListToKey(
    performanceOrderedSourceList,
    checkpointSource ? checkpointSource.sourceKey : null,
    (source) => source.sourceKey
  )
  computedSourceList.splice(0, computedSourceList.length, ...orderedSourceList)

  let currentSourceIndex = 0
  let lastFilterConditionKey = null
  let activeFilterConditionKey = null
  let activeFilterConditionJson = null
  const emittedPrefilterJobIds = new Set()

  const emitFunnelEvents = async (events) => {
    if (!events?.length || !traversalState.encryptUserId) {
      return
    }
    try {
      await hooks.jobFunnelEvents?.promise?.(
        events.map((event) => ({
          encryptCurrentUserId: traversalState.encryptUserId,
          runRecordId: hooks.runRecordId ?? undefined,
          ...event
        }))
      )
    } catch (err) {
      console.log('save job funnel events failed', err)
    }
  }

  const saveTraversalCheckpoint = async (lastProcessedJobId) => {
    const sourceKey = computedSourceList[currentSourceIndex]?.sourceKey
    if (!sourceKey || !traversalState.encryptUserId) {
      return
    }
    try {
      await hooks.jobTraversalCheckpointSaved?.promise?.({
        encryptCurrentUserId: traversalState.encryptUserId,
        sourceKey,
        filterConditionKey: activeFilterConditionKey ?? undefined,
        lastProcessedJobId
      })
    } catch (err) {
      console.log('save job traversal checkpoint failed', err)
    }
  }

  const llmScoreCache = new Map()
  let llmCallCount = 0

  const getCachedLlmMatchScore = (encryptJobId) => {
    const cached = llmScoreCache.get(encryptJobId)
    return cached && !cached.failed ? cached : null
  }

  const requestLlmMatchScore = async (job, deterministicScore) => {
    if (!isJobMatchLlmScoringEnabled || !traversalState.encryptUserId) {
      return null
    }
    const encryptJobId = job?.jobInfo?.encryptId ?? job?.encryptJobId
    if (!encryptJobId) {
      return null
    }
    if (llmScoreCache.has(encryptJobId)) {
      return getCachedLlmMatchScore(encryptJobId)
    }
    const cacheContext = {}
    try {
      await hooks.jobMatchScoreCacheGet?.promise?.(
        {
          encryptCurrentUserId: traversalState.encryptUserId,
          encryptJobId,
          resumeHash,
          modelId: jobMatchLlmModelId,
          scorerType: JobMatchScorerType.LLM,
          inputHash: getJobMatchInputHash(job)
        },
        cacheContext
      )
    } catch (err) {
      console.log('read job match score cache failed', err)
    }
    if (cacheContext.score?.score !== undefined) {
      let reasons = []
      try {
        reasons = cacheContext.score.reasonsJson
          ? JSON.parse(cacheContext.score.reasonsJson)
          : []
      } catch {}
      const result = {
        score: cacheContext.score.score,
        reasons
      }
      llmScoreCache.set(encryptJobId, result)
      return result
    }
    if (llmCallCount >= jobMatchLlmMaxCallsPerRun) {
      return null
    }
    llmCallCount++
    try {
      const result = await requestJobMatchScore({
        llmConfig: jobMatchLlmConfig,
        resumeText: resumeProfile.text,
        job,
        deterministicScore
      })
      if (!result) {
        llmScoreCache.set(encryptJobId, { failed: true })
        return null
      }
      llmScoreCache.set(encryptJobId, result)
      try {
        await hooks.jobMatchScoreCacheSet?.promise?.({
          encryptCurrentUserId: traversalState.encryptUserId,
          encryptJobId,
          resumeHash,
          modelId: jobMatchLlmModelId,
          scorerType: JobMatchScorerType.LLM,
          score: result.score,
          reasons: result.reasons,
          inputHash: getJobMatchInputHash(job)
        })
      } catch (err) {
        console.log('save job match score cache failed', err)
      }
      return result
    } catch (err) {
      llmScoreCache.set(encryptJobId, { failed: true })
      console.log('request job match llm score failed', err)
      return null
    }
  }

  const semanticFilterResultCache = new Map()
  const semanticRejectedJobIds = new Set()
  let semanticFilterCallCount = 0
  let jobFilterPlanPromise = null

  const getJobFilterPlan = async () => {
    if (!isJobSemanticFilterEnabled || !jobFilterPlanLlmConfig) {
      return null
    }
    if (!jobFilterPlanPromise) {
      jobFilterPlanPromise = requestJobFilterPlan({
        llmConfig: jobFilterPlanLlmConfig,
        criteria: jobSemanticFilterCriteria
      }).catch((err) => {
        console.log('build job filter plan failed', err)
        return null
      })
    }
    return jobFilterPlanPromise
  }

  const isSemanticRejected = (result) => {
    return Boolean(
      result &&
      result.match === false &&
      result.confidence >= jobSemanticFilterMinConfidence
    )
  }

  const runSemanticFilter = async (job, stage) => {
    if (!isJobSemanticFilterEnabled || !traversalState.encryptUserId) {
      return null
    }
    const encryptJobId = job?.jobInfo?.encryptId ?? job?.encryptJobId
    if (!encryptJobId) {
      return null
    }
    const cacheKey = `${stage}:${encryptJobId}`
    if (semanticFilterResultCache.has(cacheKey)) {
      const cached = semanticFilterResultCache.get(cacheKey)
      return cached?.failed ? null : cached
    }
    const inputHash = getJobSemanticInputHash(job, stage)
    const cacheContext = {}
    try {
      await hooks.jobSemanticFilterCacheGet?.promise?.(
        {
          encryptCurrentUserId: traversalState.encryptUserId,
          encryptJobId,
          criteriaHash: jobSemanticCriteriaHash,
          modelId: jobSemanticLlmModelId,
          stage
        },
        cacheContext
      )
    } catch (err) {
      console.log('read job semantic filter cache failed', err)
    }
    if (
      cacheContext.record &&
      cacheContext.record.inputHash === inputHash
    ) {
      let reasons = []
      let constraints = {}
      try {
        reasons = cacheContext.record.reasonsJson
          ? JSON.parse(cacheContext.record.reasonsJson)
          : []
        constraints = cacheContext.record.constraintsJson
          ? JSON.parse(cacheContext.record.constraintsJson)
          : {}
      } catch {}
      const result = {
        match: Boolean(cacheContext.record.matchResult),
        confidence: Number(cacheContext.record.confidence) || 0,
        reasons,
        constraints
      }
      semanticFilterResultCache.set(cacheKey, result)
      return result
    }

    const plan =
      (await getJobFilterPlan()) ??
      buildFallbackJobFilterPlan(jobSemanticFilterCriteria)
    let result = null
    if (stage === 'list' && jobSemanticFilterListPrecheck) {
      const hardRejectResult = evaluatePlanHardReject(job, plan ?? {})
      if (hardRejectResult.reject) {
        result = {
          match: false,
          confidence: 1,
          reasons: hardRejectResult.reasons,
          constraints: {
            source: 'hard-rule'
          }
        }
      }
    }
    if (!result && semanticFilterCallCount < jobSemanticFilterMaxCallsPerRun) {
      semanticFilterCallCount++
      try {
        result = await requestJobSemanticFilter({
          llmConfig: jobSemanticLlmConfig,
          criteria: jobSemanticFilterCriteria,
          plan,
          job,
          stage
        })
      } catch (err) {
        console.log('request job semantic filter failed', err)
      }
    }
    if (!result) {
      semanticFilterResultCache.set(cacheKey, { failed: true })
      return null
    }
    semanticFilterResultCache.set(cacheKey, result)
    try {
      await hooks.jobSemanticFilterCacheSet?.promise?.({
        encryptCurrentUserId: traversalState.encryptUserId,
        encryptJobId,
        criteriaHash: jobSemanticCriteriaHash,
        modelId: jobSemanticLlmModelId,
        stage,
        matchResult: result.match ? 1 : 0,
        confidence: result.confidence,
        reasons: result.reasons,
        constraints: result.constraints,
        inputHash
      })
    } catch (err) {
      console.log('save job semantic filter cache failed', err)
    }
    return result
  }

  afterPageLoad: while (true) {
    const sourceCheckpoint = findCheckpointBySourceKey(
      traversalState.checkpoints,
      computedSourceList[currentSourceIndex]?.sourceKey
    )
    // check set security question tip modal
    let setSecurityQuestionTipModelProxy
    try {
      setSecurityQuestionTipModelProxy = await page.waitForSelector('.dialog-wrap.dialog-account-safe', { timeout: 3 * 1000 })
    }
    catch(err) {
      console.log(`cannot find set security question tip modal, just continue`)
    }
    if (
      setSecurityQuestionTipModelProxy
    ) {
      await sleep(1000)
      setSecurityQuestionTipModelProxy = await page.$('.dialog-wrap.dialog-account-safe')
      const closeButtonProxy = await setSecurityQuestionTipModelProxy?.$('.close')

      if (setSecurityQuestionTipModelProxy && closeButtonProxy) {
        await closeButtonProxy.click()
      }
    }

    let filterConditions =
      combineRecommendJobFilterType === CombineRecommendJobFilterType.STATIC_COMBINE
        ? formatStaticCombineFilters(staticCombineRecommendJobFilterConditions)
            .slice(0, maxRecommendJobFilterCombinations)
          : combineFiltersWithConstraintsGenerator(anyCombineRecommendJobFilter, {
              includeEmptyCondition:
                !hasAnyCombineRecommendJobFilter ||
                !isSkipEmptyConditionForCombineRecommendJobFilter,
              maxCombinations: maxRecommendJobFilterCombinations
            })
    if (performanceMaps) {
      filterConditions = sortFiltersByPerformance(
        filterConditions,
        computedSourceList[currentSourceIndex]?.sourceKey,
        performanceMaps,
        getFilterConditionKey
      )
    }
    filterConditions = rotateListToKey(
      filterConditions,
      sourceCheckpoint?.filterConditionKey ?? null,
      (filterCondition) => getFilterConditionKey(filterCondition)
    )
    let expectJobList
    let filterConditionIndex = -1
    iterateFilterCondition: for (
      const filterCondition of filterConditions
    ) {
      filterConditionIndex++
      console.log(`current filter condition index to apply: ${filterConditionIndex}`, JSON.stringify(filterCondition))
      findInCurrentFilterCondition: while(true) {
        await sleepWithRandomDelay(500)

        await Promise.all([
          Promise.race([
            page.waitForSelector(USER_SET_EXPECT_JOB_ENTRIES_SELECTOR),
            page.waitForSelector(RECOMMEND_JOB_ENTRY_SELECTOR),
          ]),
          Promise.race([
            page.waitForSelector(".job-list-container .rec-job-list"),
            page.waitForSelector(".recommend-result-job .job-empty-wrapper")
          ])
        ])
        await sleep(300)
        let onPageCurrentSourceIndex = -1
        for (let i=0; i < computedSourceList.length; i++) {
          const computedSource = computedSourceList[i]
          if (await computedSource.getIsCurrentActiveSource()) {
            onPageCurrentSourceIndex = i
            break
          }
        }
        if (
          (
            combineRecommendJobFilterType === CombineRecommendJobFilterType.STATIC_COMBINE && filterCondition === null
          )
          ||
          (
            combineRecommendJobFilterType === CombineRecommendJobFilterType.ANY_COMBINE &&
            isSkipEmptyConditionForCombineRecommendJobFilter &&
            Object.keys(filterCondition).length &&
            isFilterConditionEmpty(filterCondition)
          )
        ) {
          continue iterateFilterCondition
        }
        expectJobList = await getExpectJobList(page)
        if (onPageCurrentSourceIndex === currentSourceIndex) {
          // first navigation and can immediately start chat (recommend job)
        } else {
          await computedSourceList[currentSourceIndex].setToActiveSource()
          await page.waitForResponse(
            response => {
              if (
                response.url().startsWith('https://www.zhipin.com/wapi/zpgeek/pc/recommend/job/list.json') ||
                response.url().startsWith('https://www.zhipin.com/wapi/zpgeek/search/joblist.json')
              ) {
                return true
              }
              return false
            }
          );
          await storeStorage(page).catch(() => void 0)
          lastFilterConditionKey = null
          await sleepWithRandomDelay(600)
          await waitForSageTimeOrJustContinue({
            tag: 'afterJobSourceChosen',
            hooks
          })
        }
        const filterConditionKey = getFilterConditionKey(filterCondition)
        activeFilterConditionKey = filterConditionKey
        activeFilterConditionJson = filterCondition ? JSON.stringify(filterCondition) : null
        if (filterConditionKey !== lastFilterConditionKey) {
          await sleepWithRandomDelay(300)
          await setFilterCondition(page, filterCondition, {
            jobFilterConditionsMapByCode,
            industryFilterConditionsMapByCode,
            industryFilterConditionsMapByIndex,
            industryFilterConditionCodeToIndexMap,
            flattedCityList
          })
          lastFilterConditionKey = filterConditionKey
        }
        await waitForJobListIdle(page)
        await sleepWithRandomDelay(200)
        try {
          const { targetJobIndex, targetJobData } = await new Promise(async (resolve, reject) => {
            let reqHandler = null
            let resHandler = null
            try {
              let requestNextPagePromiseWithResolver = null
              reqHandler = function (request) {
                  if (
                    request.url().startsWith('https://www.zhipin.com/wapi/zpgeek/pc/recommend/job/list.json') ||
                    request.url().startsWith('https://www.zhipin.com/wapi/zpgeek/search/joblist.json')
                  ) {
                    requestNextPagePromiseWithResolver = (() => {
                      const o = {}
                      o.promise = new Promise((resolve) => {
                        o.resolve = resolve
                      })
                      o.timeout = setTimeout(() => {
                        o.resolve()
                      }, 15 * 1000)
                      return o
                    })()
                    const resolver = requestNextPagePromiseWithResolver
                    page.off(reqHandler)
                    reqHandler = null

                    resHandler = function (response) {
                      if (response.request() === request) {
                        clearTimeout(resolver.timeout)
                        resolver.resolve()
                        page.off(resHandler)
                        resHandler = null
                      }
                    }
                    page.on('response', resHandler)
                  }
                }
              page.on('request', reqHandler)
              // job list
              let  recommendJobListElProxy
              try {
                recommendJobListElProxy= await page.waitForSelector('.job-list-container .rec-job-list', { timeout: 5 * 1000 })
              } catch {}
              if (!recommendJobListElProxy){
                await hooks.encounterEmptyRecommendJobList?.promise({
                  pageQuery: await getPageQuery(page)
                })
                throw new Error('CANNOT_FIND_EXCEPT_JOB_IN_THIS_FILTER_CONDITION')
              }
              let jobListData = []
              async function updateJobListData () {
                jobListData = await getJobList(page)
                const skipReasonCount = {}
                const prefilterEvents = []
                for (const it of jobListData) {
                  const hasEmitted = emittedPrefilterJobIds.has(it.encryptJobId) ||
                    blockJobNotSuit.has(it.encryptJobId) ||
                    traversalState.processedJobIds.has(it.encryptJobId)
                  const skipReason = getJobListSkipReason(it, {
                    expectCityList,
                    expectWorkExpList,
                    expectCityNotMatchStrategy,
                    expectWorkExpNotMatchStrategy,
                    isSalaryFilterEnabled,
                    expectSalaryNotMatchStrategy,
                    blockCompanyNameRegExp,
                    blockCompanyNameRegMatchStrategy,
                    companyAllowList: Array.from(expectCompanySet),
                    isNoOpStrategy: strategy => strategy === MarkAsNotSuitOp.NO_OP,
                    blockJobNotSuit,
                    blockBossNotActive,
                    blockBossNotNewChat,
                    blockJobNotHiring,
                    processedJobIds: traversalState.processedJobIds,
                    isSalaryParseable: job => {
                      const salaryData = parseSalary(job.salaryDesc)
                      return Boolean(salaryData.high && salaryData.low)
                    },
                    isSalarySuit: job => checkIfSalarySuit(job.salaryDesc)
                  })
                  if (!skipReason) {
                    continue
                  }
                  blockJobNotSuit.add(it.encryptJobId)
                  if (skipReason !== 'PROCESSED_RECENTLY' && !hasEmitted) {
                    emittedPrefilterJobIds.add(it.encryptJobId)
                    prefilterEvents.push({
                      encryptJobId: it.encryptJobId,
                      encryptBossId: it.encryptBossId,
                      eventType: JobFunnelEventType.PREFILTER_SKIPPED,
                      eventDate: new Date(),
                      jobSource: JobSource[computedSourceList[currentSourceIndex]?.type],
                      sourceKey: computedSourceList[currentSourceIndex]?.sourceKey,
                      searchKeyword: computedSourceList[currentSourceIndex]?.keyword,
                      filterConditionKey: activeFilterConditionKey ?? undefined,
                      filterConditionJson: activeFilterConditionJson ?? undefined,
                      skipReason
                    })
                  }
                  skipReasonCount[skipReason] = (skipReasonCount[skipReason] ?? 0) + 1
                }
                if (Object.keys(skipReasonCount).length) {
                  console.log('job list prefilter skipped:', skipReasonCount)
                }
                await emitFunnelEvents(prefilterEvents)
              }
              await updateJobListData()

              let hasReachLastPage = false
              let targetJobIndex = -1
              let targetJobData, selectedJobData // they show be same; one is from list, another is from detail
              let currentJobMatchScore = null
              let currentJobMatchDetail = null
              const isTempTargetJobEligible = (it) => {
                return !blockBossNotNewChat.has(it.encryptBossId) &&
                  (jobTypeList.length === 0 || jobTypeList.includes(Number(it.jobType))) &&
                  !blockBossNotActive.has(it.encryptBossId) &&
                  !blockJobNotSuit.has(it.encryptJobId) &&
                  !blockJobNotHiring.has(it.encryptJobId) &&
                  !traversalState.processedJobIds.has(it.encryptJobId) &&
                  (
                    (
                      enableCompanyAllowList ?
                        [...expectCompanySet].find(
                          name => it.brandName?.toLowerCase?.()?.includes(name.toLowerCase())
                        )
                        :
                        true
                    ) || (
                      // enter job detail to mark as not suit for city filter
                      (
                        Array.isArray(expectCityList) &&
                        expectCityList.length &&
                        [
                          MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS,
                          MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL
                        ].includes(expectCityNotMatchStrategy) &&
                        strategyScopeOptionWhenMarkJobCityNotMatch === StrategyScopeOptionWhenMarkJobNotMatch.ALL_JOB
                      ) ? !expectCityList.includes(it.cityName) : false
                    ) || (
                      // enter job detail to mark as not suit for work exp filter
                      (
                        Array.isArray(expectWorkExpList) &&
                        expectWorkExpList.length &&
                        [
                          MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS,
                          MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL
                        ].includes(expectWorkExpNotMatchStrategy) &&
                        strategyScopeOptionWhenMarkJobWorkExpNotMatch === StrategyScopeOptionWhenMarkJobNotMatch.ALL_JOB
                      ) ? !expectWorkExpList.includes(it.jobExperience) : false
                    ) || (
                      // enter job detail to mark as not suit for salary filter
                      (
                        isSalaryFilterEnabled &&
                        [
                          MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS,
                          MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL
                        ].includes(expectSalaryNotMatchStrategy) &&
                        strategyScopeOptionWhenMarkSalaryNotMatch === StrategyScopeOptionWhenMarkJobNotMatch.ALL_JOB
                      ) ? !checkIfSalarySuit(it.salaryDesc) : false
                    ) || (
                      // enter job detail to mark as not suit for company name filter
                      !!blockCompanyNameRegExp &&
                      blockCompanyNameRegExp.test(it.brandName?.toLowerCase?.() ?? '') &&
                        [
                          MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS,
                          MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL
                        ].includes(blockCompanyNameRegMatchStrategy)
                    )
                  )
              }
              const getRankedTargetJobs = () => {
                return rankJobCandidates(jobListData, {
                  profile: isJobMatchScoringEnabled ? resumeProfile : null,
                  weights: jobMatchWeights,
                  isEligible: isTempTargetJobEligible,
                  getOptions: getJobMatchOptionsForListJob
                })
              }
              const getRankedTargetJobsWithLlm = async () => {
                const ranked = getRankedTargetJobs()
                if (!ranked.length) {
                  return ranked
                }
                let candidates = [...ranked]
                if (isJobMatchLlmScoringEnabled) {
                  const topCandidates = candidates.slice(0, jobMatchLlmTopN)
                  for (const candidate of topCandidates) {
                    const llmResult = await requestLlmMatchScore(
                      candidate.job,
                      candidate.score
                    )
                    if (llmResult) {
                      candidate.llmScore = llmResult.score
                      candidate.reasons = [
                        ...(candidate.reasons ?? []),
                        ...(llmResult.reasons ?? [])
                      ]
                      candidate.score = combineMatchScores(
                        candidate.score,
                        llmResult.score,
                        jobMatchLlmWeight
                      )
                    }
                  }
                  candidates.sort((a, b) => b.score - a.score || a.index - b.index)
                }
                if (
                  isJobSemanticFilterEnabled &&
                  jobSemanticFilterListPrecheck
                ) {
                  const precheckCandidates = candidates.slice(
                    0,
                    jobSemanticFilterTopN
                  )
                  for (const candidate of precheckCandidates) {
                    const semanticResult = await runSemanticFilter(
                      candidate.job,
                      'list'
                    )
                    if (isSemanticRejected(semanticResult)) {
                      const encryptJobId = candidate.job.encryptJobId
                      semanticRejectedJobIds.add(encryptJobId)
                      blockJobNotSuit.add(encryptJobId)
                      await emitFunnelEvents([{
                        encryptJobId,
                        encryptBossId: candidate.job.encryptBossId,
                        eventType: JobFunnelEventType.SEMANTIC_FILTER_REJECTED,
                        eventDate: new Date(),
                        jobSource: JobSource[computedSourceList[currentSourceIndex]?.type],
                        sourceKey: computedSourceList[currentSourceIndex]?.sourceKey,
                        searchKeyword: computedSourceList[currentSourceIndex]?.keyword,
                        filterConditionKey: activeFilterConditionKey ?? undefined,
                        filterConditionJson: activeFilterConditionJson ?? undefined,
                        extInfo: JSON.stringify({
                          stage: 'list',
                          confidence: semanticResult.confidence,
                          reasons: semanticResult.reasons,
                          constraints: semanticResult.constraints
                        })
                      }])
                    }
                  }
                  candidates = candidates.filter(
                    (candidate) => !semanticRejectedJobIds.has(candidate.job.encryptJobId)
                  )
                }
                return candidates.sort((a, b) => b.score - a.score || a.index - b.index)
              }
              async function getTempTargetJobIndexToCheckDetail () {
                const ranked = await getRankedTargetJobsWithLlm()
                return ranked[0]?.index ?? -1
              }
              continueFind: while (targetJobIndex < 0 && !hasReachLastPage) {
                currentJobMatchScore = null
                // when disable company allow list, we will believe that the first one in the list is your expect job.
                let tempTargetJobIndexToCheckDetail = await getTempTargetJobIndexToCheckDetail()
                while (tempTargetJobIndexToCheckDetail < 0 && !hasReachLastPage) {
                  // fetch new
                  const recommendJobListElBBox = await recommendJobListElProxy.boundingBox()
                  const windowInnerHeight = await page.evaluate('window.innerHeight')
                  await page.mouse.move(
                    recommendJobListElBBox.x + recommendJobListElBBox.width / 2,
                    windowInnerHeight / 2
                  )
                  let scrolledHeight = 0
                  const increase = 40 + Math.floor(30 * Math.random())

                  while (
                    !requestNextPagePromiseWithResolver &&
                    !hasReachLastPage
                  ) {
                    scrolledHeight += increase
                    await page.mouse.wheel({deltaY: increase});
                    await sleep(100)
                    await requestNextPagePromiseWithResolver?.promise
                    hasReachLastPage = await getHasMore(page)
                    if (hasReachLastPage) {
                      console.log(`Arrive the terminal of the job list.`)
                    }
                  }
                  requestNextPagePromiseWithResolver = null
                  await waitForSageTimeOrJustContinue({
                    tag: 'afterJobListPageFetched',
                    hooks
                  })
                  await waitForJobListIdle(page)
                  await sleepWithRandomDelay(300)
                  await updateJobListData()
                  tempTargetJobIndexToCheckDetail = await getTempTargetJobIndexToCheckDetail()
                }

                if (tempTargetJobIndexToCheckDetail < 0 && hasReachLastPage) {
                  // has reach last page and not find target job
                  reject(new Error('CANNOT_FIND_EXCEPT_JOB_IN_THIS_FILTER_CONDITION'))
                  return
                }

                //#region here to check detail
                if (tempTargetJobIndexToCheckDetail >= 0) {
                  // scroll that target element into view
                  await scrollJobIntoView(page, tempTargetJobIndexToCheckDetail)

                  await sleepWithRandomDelay(200)

                  if (tempTargetJobIndexToCheckDetail === 0) {
                  } else {
                    const recommendJobItemList = await recommendJobListElProxy.$$('ul.rec-job-list li.job-card-box')
                    const targetJobElProxy = recommendJobItemList[tempTargetJobIndexToCheckDetail]
                    // click that element
                    await sleep(500)
                    await targetJobElProxy.click()
                    await page.waitForResponse(
                      response => {
                        if (
                          response.url().startsWith('https://www.zhipin.com/wapi/zpgeek/job/detail.json')
                        ) {
                          return true
                        }
                        return false
                      }
                    );
                    await sleepWithRandomDelay(2000)
                  }
                  await waitForSageTimeOrJustContinue({
                    tag: 'afterJobDetailFetched',
                    hooks
                  })
                  targetJobData = await getJobDetail(page)
                  selectedJobData = await getCurrentJob(page)
                  const listMatchResult = scoreJobMatch(
                    jobListData[tempTargetJobIndexToCheckDetail],
                    isJobMatchScoringEnabled ? resumeProfile : null,
                    {
                      weights: jobMatchWeights,
                      ...getJobMatchOptionsForListJob(jobListData[tempTargetJobIndexToCheckDetail])
                    }
                  )
                  // save the job detail info
                  await hooks.jobDetailIsGetFromRecommendList?.promise(targetJobData)
                  traversalState.processedJobIds.add(targetJobData.jobInfo.encryptId)
                  await emitFunnelEvents([{
                    encryptJobId: targetJobData.jobInfo.encryptId,
                    encryptBossId: targetJobData.jobInfo.encryptUserId,
                    eventType: JobFunnelEventType.DETAIL_VIEWED,
                    eventDate: new Date(),
                    jobSource: JobSource[computedSourceList[currentSourceIndex]?.type],
                    sourceKey: computedSourceList[currentSourceIndex]?.sourceKey,
                    searchKeyword: computedSourceList[currentSourceIndex]?.keyword,
                    filterConditionKey: activeFilterConditionKey ?? undefined,
                    filterConditionJson: activeFilterConditionJson ?? undefined,
                    matchScore: listMatchResult.isScored ? listMatchResult.score : undefined
                  }])
                  await saveTraversalCheckpoint(targetJobData.jobInfo.encryptId)

                  const detailMatchResult = scoreJobMatch(
                    targetJobData,
                    isJobMatchScoringEnabled ? resumeProfile : null,
                    {
                      weights: jobMatchWeights,
                      ...getJobMatchOptionsForDetailJob(selectedJobData)
                    }
                  )
                  const llmDetailResult = getCachedLlmMatchScore(
                    targetJobData.jobInfo.encryptId
                  )
                  const finalDetailMatchScore = detailMatchResult.isScored
                    ? combineMatchScores(
                        detailMatchResult.score,
                        llmDetailResult?.score,
                        jobMatchLlmWeight
                      )
                    : null
                  currentJobMatchScore = finalDetailMatchScore
                  const semanticFilterResult = await runSemanticFilter(
                    targetJobData,
                    'detail'
                  )
                  currentJobMatchDetail = {
                    reasons: [
                      ...(detailMatchResult.reasons ?? []),
                      ...(llmDetailResult?.reasons ?? [])
                    ],
                    components: detailMatchResult.components ?? null,
                    semanticResult: semanticFilterResult ?? null
                  }
                  if (isSemanticRejected(semanticFilterResult)) {
                    const encryptJobId = targetJobData.jobInfo.encryptId
                    semanticRejectedJobIds.add(encryptJobId)
                    blockJobNotSuit.add(encryptJobId)
                    await emitFunnelEvents([{
                      encryptJobId,
                      encryptBossId: targetJobData.jobInfo.encryptUserId,
                      eventType: JobFunnelEventType.SEMANTIC_FILTER_REJECTED,
                      eventDate: new Date(),
                      jobSource: JobSource[computedSourceList[currentSourceIndex]?.type],
                      sourceKey: computedSourceList[currentSourceIndex]?.sourceKey,
                      searchKeyword: computedSourceList[currentSourceIndex]?.keyword,
                      filterConditionKey: activeFilterConditionKey ?? undefined,
                      filterConditionJson: activeFilterConditionJson ?? undefined,
                      matchScore: currentJobMatchScore ?? undefined,
                      extInfo: JSON.stringify({
                        stage: 'detail',
                        confidence: semanticFilterResult.confidence,
                        reasons: semanticFilterResult.reasons,
                        constraints: semanticFilterResult.constraints
                      })
                    }])
                    await hooks.jobCandidateCollected?.promise(
                      buildJobCandidateRecord({
                        encryptCurrentUserId: traversalState.encryptUserId,
                        profileId: activeJobSearchProfileId,
                        jobInfo: targetJobData.jobInfo,
                        listJob: selectedJobData,
                        matchScore: currentJobMatchScore,
                        decision: 'rejected:semantic',
                        reasons: semanticFilterResult.reasons ?? [],
                        semanticResult: semanticFilterResult,
                        sourceKey: computedSourceList[currentSourceIndex]?.sourceKey,
                        searchKeyword: computedSourceList[currentSourceIndex]?.keyword,
                        filterConditionKey: activeFilterConditionKey ?? null
                      })
                    )
                    await saveTraversalCheckpoint(encryptJobId)
                    continue continueFind
                  }
                  if (
                    isJobMatchScoringEnabled &&
                    jobMatchMinScore > 0 &&
                    finalDetailMatchScore !== null &&
                    finalDetailMatchScore < jobMatchMinScore
                  ) {
                    blockJobNotSuit.add(targetJobData.jobInfo.encryptId)
                    await emitFunnelEvents([{
                      encryptJobId: targetJobData.jobInfo.encryptId,
                      encryptBossId: targetJobData.jobInfo.encryptUserId,
                      eventType: JobFunnelEventType.LOW_MATCH_SCORE,
                      eventDate: new Date(),
                      jobSource: JobSource[computedSourceList[currentSourceIndex]?.type],
                      sourceKey: computedSourceList[currentSourceIndex]?.sourceKey,
                      searchKeyword: computedSourceList[currentSourceIndex]?.keyword,
                      filterConditionKey: activeFilterConditionKey ?? undefined,
                      filterConditionJson: activeFilterConditionJson ?? undefined,
                      matchScore: finalDetailMatchScore,
                      extInfo: JSON.stringify({
                        reasons: [
                          ...(detailMatchResult.reasons ?? []),
                          ...(llmDetailResult?.reasons ?? [])
                        ],
                        components: detailMatchResult.components,
                        deterministicScore: detailMatchResult.score,
                        llmScore: llmDetailResult?.score ?? null
                      })
                    }])
                    await hooks.jobCandidateCollected?.promise(
                      buildJobCandidateRecord({
                        encryptCurrentUserId: traversalState.encryptUserId,
                        profileId: activeJobSearchProfileId,
                        jobInfo: targetJobData.jobInfo,
                        listJob: selectedJobData,
                        matchScore: finalDetailMatchScore,
                        decision: 'rejected:low-score',
                        reasons: [
                          ...(detailMatchResult.reasons ?? []),
                          ...(llmDetailResult?.reasons ?? [])
                        ],
                        components: detailMatchResult.components ?? null,
                        sourceKey: computedSourceList[currentSourceIndex]?.sourceKey,
                        searchKeyword: computedSourceList[currentSourceIndex]?.keyword,
                        filterConditionKey: activeFilterConditionKey ?? null
                      })
                    )
                    await saveTraversalCheckpoint(targetJobData.jobInfo.encryptId)
                    continue continueFind
                  }

                  //#region collect not suit reasons
                  const notSuitReasonIdToStrategyMap = {}
                  const notSuitConditionHandleMap = {
                    async companyName() {
                      blockJobNotSuit.add(targetJobData.jobInfo.encryptId)
                      if (blockCompanyNameRegMatchStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL && !await getNotSuitableButton(page)) {
                        try {
                          await hooks.jobMarkedAsNotSuit.promise(
                            targetJobData,
                            {
                              markFrom: ChatStartupFrom.AutoFromRecommendList,
                              markReason: MarkAsNotSuitReason.COMPANY_NAME_NOT_SUIT,
                              extInfo: null,
                              markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL,
                              jobSource: JobSource[computedSourceList[currentSourceIndex]?.type]
                            }
                          )
                        } catch {
                        }
                      }
                      else if (blockCompanyNameRegMatchStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS) {
                        try {
                          await waitForSageTimeOrJustContinue({
                            tag: 'beforeJobNotSuitMarked',
                            hooks
                          })
                          const { chosenReasonInUi } = await markJobAsNotSuitInRecommendPage(MarkAsNotSuitReason.COMPANY_NAME_NOT_SUIT)
                          await hooks.jobMarkedAsNotSuit.promise(
                            targetJobData,
                            {
                              markFrom: ChatStartupFrom.AutoFromRecommendList,
                              markReason: MarkAsNotSuitReason.COMPANY_NAME_NOT_SUIT,
                              extInfo: {
                                chosenReasonInUi
                              },
                              markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS,
                              jobSource: JobSource[computedSourceList[currentSourceIndex]?.type]
                            }
                          )
                        } catch(err) {
                          console.log(`mark boss inactive failed`, err)
                        }
                      }
                    },
                    async active() {
                      blockBossNotActive.add(targetJobData.jobInfo.encryptUserId)
                      if (jobNotActiveStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL || !await getNotSuitableButton(page)) {
                        try {
                          await hooks.jobMarkedAsNotSuit.promise(
                            targetJobData,
                            {
                              markFrom: ChatStartupFrom.AutoFromRecommendList,
                              markReason: MarkAsNotSuitReason.BOSS_INACTIVE,
                              extInfo: null,
                              markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL,
                              jobSource: JobSource[computedSourceList[currentSourceIndex]?.type]
                            }
                          )
                        } catch {
                        }
                      }
                      else if (jobNotActiveStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS) {
                        try {
                          await waitForSageTimeOrJustContinue({
                            tag: 'beforeJobNotSuitMarked',
                            hooks
                          })
                          const { chosenReasonInUi } = await markJobAsNotSuitInRecommendPage(MarkAsNotSuitReason.BOSS_INACTIVE)
                          await hooks.jobMarkedAsNotSuit.promise(
                            targetJobData,
                            {
                              markFrom: ChatStartupFrom.AutoFromRecommendList,
                              markReason: MarkAsNotSuitReason.BOSS_INACTIVE,
                              extInfo: {
                                bossActiveTimeDesc: targetJobData.bossInfo.activeTimeDesc,
                                chosenReasonInUi
                              },
                              markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS,
                              jobSource: JobSource[computedSourceList[currentSourceIndex]?.type]
                            }
                          )
                        } catch(err) {
                          console.log(`mark boss inactive failed`, err)
                        }
                      }
                    },
                    async city() {
                      blockJobNotSuit.add(targetJobData.jobInfo.encryptId)
                      if (expectCityNotMatchStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL || !await getNotSuitableButton(page)) {
                        try {
                          await hooks.jobMarkedAsNotSuit.promise(
                            targetJobData,
                            {
                              markFrom: ChatStartupFrom.AutoFromRecommendList,
                              markReason: MarkAsNotSuitReason.JOB_CITY_NOT_SUIT,
                              extInfo: null,
                              markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL,
                              jobSource: JobSource[computedSourceList[currentSourceIndex]?.type]
                            }
                          )
                        } catch {
                        }
                      }
                      else if (expectCityNotMatchStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS) {
                        try {
                          await waitForSageTimeOrJustContinue({
                            tag: 'beforeJobNotSuitMarked',
                            hooks
                          })
                          const { chosenReasonInUi } = await markJobAsNotSuitInRecommendPage(MarkAsNotSuitReason.JOB_CITY_NOT_SUIT)
                          await hooks.jobMarkedAsNotSuit.promise(
                            targetJobData,
                            {
                              markFrom: ChatStartupFrom.AutoFromRecommendList,
                              markReason: MarkAsNotSuitReason.JOB_CITY_NOT_SUIT,
                              extInfo: {
                                chosenReasonInUi
                              },
                              markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS,
                              jobSource: JobSource[computedSourceList[currentSourceIndex]?.type]
                            }
                          )
                        } catch(err) {
                          console.log(`mark job city not suit failed`, err)
                        }
                      }
                    },
                    async workExp() {
                      blockJobNotSuit.add(targetJobData.jobInfo.encryptId)
                      if (expectWorkExpNotMatchStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL || !await getNotSuitableButton(page)) {
                        try {
                          await hooks.jobMarkedAsNotSuit.promise(
                            targetJobData,
                            {
                              markFrom: ChatStartupFrom.AutoFromRecommendList,
                              markReason: MarkAsNotSuitReason.JOB_WORK_EXP_NOT_SUIT,
                              extInfo: null,
                              markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL,
                              jobSource: JobSource[computedSourceList[currentSourceIndex]?.type]
                            }
                          )
                        } catch {
                        }
                      }
                      else if (expectWorkExpNotMatchStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS) {
                        try {
                          await waitForSageTimeOrJustContinue({
                            tag: 'beforeJobNotSuitMarked',
                            hooks
                          })
                          const { chosenReasonInUi } = await markJobAsNotSuitInRecommendPage(MarkAsNotSuitReason.JOB_WORK_EXP_NOT_SUIT)
                          await hooks.jobMarkedAsNotSuit.promise(
                            targetJobData,
                            {
                              markFrom: ChatStartupFrom.AutoFromRecommendList,
                              markReason: MarkAsNotSuitReason.JOB_WORK_EXP_NOT_SUIT,
                              extInfo: {
                                chosenReasonInUi
                              },
                              markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS,
                              jobSource: JobSource[computedSourceList[currentSourceIndex]?.type]
                            }
                          )
                        } catch(err) {
                          console.log(`mark job work exp not suit failed`, err)
                        }
                      }
                    },
                    async jobDetail() {
                      blockJobNotSuit.add(targetJobData.jobInfo.encryptId)
                      if (jobNotMatchStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL || !await getNotSuitableButton(page)) {
                        try {
                          await hooks.jobMarkedAsNotSuit.promise(
                            targetJobData,
                            {
                              markFrom: ChatStartupFrom.AutoFromRecommendList,
                              markReason: MarkAsNotSuitReason.JOB_NOT_SUIT,
                              extInfo: null,
                              markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL,
                              jobSource: JobSource[computedSourceList[currentSourceIndex]?.type]
                            }
                          )
                        } catch {
                        }
                      }
                      else if (jobNotMatchStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS) {
                        try {
                          await waitForSageTimeOrJustContinue({
                            tag: 'beforeJobNotSuitMarked',
                            hooks
                          })
                          const { chosenReasonInUi } = await markJobAsNotSuitInRecommendPage(MarkAsNotSuitReason.JOB_NOT_SUIT)
                          await hooks.jobMarkedAsNotSuit.promise(
                            targetJobData,
                            {
                              markFrom: ChatStartupFrom.AutoFromRecommendList,
                              markReason: MarkAsNotSuitReason.JOB_NOT_SUIT,
                              extInfo: {
                                bossActiveTimeDesc: targetJobData.bossInfo.activeTimeDesc,
                                chosenReasonInUi
                              },
                              markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS,
                              jobSource: JobSource[computedSourceList[currentSourceIndex]?.type]
                            }
                          )
                        } catch(err) {
                          console.log(`mark job detail not suit failed`, err)
                        }
                      }
                    },
                    async salary() {
                      blockJobNotSuit.add(targetJobData.jobInfo.encryptId)
                      if (expectSalaryNotMatchStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL || !await getNotSuitableButton(page)) {
                        try {
                          await hooks.jobMarkedAsNotSuit.promise(
                            targetJobData,
                            {
                              markFrom: ChatStartupFrom.AutoFromRecommendList,
                              markReason: MarkAsNotSuitReason.JOB_SALARY_NOT_SUIT,
                              extInfo: {
                                salaryDesc: selectedJobData.salaryDesc,
                              },
                              markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL,
                              jobSource: JobSource[computedSourceList[currentSourceIndex]?.type]
                            }
                          )
                        } catch {
                        }
                      }
                      else if (expectSalaryNotMatchStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS) {
                        try {
                          await waitForSageTimeOrJustContinue({
                            tag: 'beforeJobNotSuitMarked',
                            hooks
                          })
                          const { chosenReasonInUi } = await markJobAsNotSuitInRecommendPage(MarkAsNotSuitReason.JOB_SALARY_NOT_SUIT)
                          await hooks.jobMarkedAsNotSuit.promise(
                            targetJobData,
                            {
                              markFrom: ChatStartupFrom.AutoFromRecommendList,
                              markReason: MarkAsNotSuitReason.JOB_SALARY_NOT_SUIT,
                              extInfo: {
                                salaryDesc: selectedJobData.salaryDesc,
                                chosenReasonInUi
                              },
                              markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS,
                              jobSource: JobSource[computedSourceList[currentSourceIndex]?.type]
                            }
                          )
                        } catch(err) {
                          console.log(`mark job salary not suit failed`, err)
                        }
                      }
                    }
                  }

                  if (
                    !!blockCompanyNameRegExp && blockCompanyNameRegExp.test(selectedJobData.brandName ?? '')
                  ) {
                    notSuitReasonIdToStrategyMap.companyName = blockCompanyNameRegMatchStrategy
                  }
                  //#region
                  // null
                  // 刚刚活跃 // 今日活跃 // 昨日活跃 // 3日内活跃 // 本周活跃 // 2周内活跃
                  // 本月活跃 // 2月内活跃 // 3月内活跃 // 4月内活跃 // 5月内活跃 // 近半年活跃 // 半年前活跃
                  //#endregion
                  let activeTimeDescForCompare = targetJobData.bossInfo.activeTimeDesc
                  // handle empty string case
                  if (activeTimeDescForCompare === '') {
                    activeTimeDescForCompare = '半年前活跃'
                  }
                  const indexOfActiveText = activeDescList.indexOf(activeTimeDescForCompare)
                  if (
                    markAsNotActiveSelectedTimeRange > 0 &&
                    indexOfActiveText > 0 && indexOfActiveText <= markAsNotActiveSelectedTimeRange
                  ) {
                    // click prevent recommend button
                    notSuitReasonIdToStrategyMap.active = jobNotActiveStrategy
                  }
                  if (
                    (Array.isArray(expectCityList) && expectCityList.length) && !expectCityList.includes(selectedJobData.cityName)
                  ) {
                    notSuitReasonIdToStrategyMap.city = expectCityNotMatchStrategy
                  }
                  if (
                    (Array.isArray(expectWorkExpList) && expectWorkExpList.length) && !expectWorkExpList.includes(selectedJobData.jobExperience)
                  ) {
                    notSuitReasonIdToStrategyMap.workExp = expectWorkExpNotMatchStrategy
                  }
                  if (
                    !testIfJobTitleOrDescriptionSuit(
                      targetJobData.jobInfo,
                      jobDetailRegExpMatchLogic,
                      {
                        expectJobNameRegExpStr,
                        expectJobTypeRegExpStr,
                        expectJobDescRegExpStr
                      }
                    )
                  ) {
                    notSuitReasonIdToStrategyMap.jobDetail = jobNotMatchStrategy
                  }
                  if (
                    !checkIfSalarySuit(selectedJobData.salaryDesc)
                  ) {
                    notSuitReasonIdToStrategyMap.salary = expectSalaryNotMatchStrategy
                  }
                  // #endregion
                  console.log('not suit reason and related strategy: ', notSuitReasonIdToStrategyMap)

                  // #region execute mark logic
                  // 1. find the one mark on Boss
                  const markOnBossCondition = findConditionByStrategy(
                    notSuitReasonIdToStrategyMap,
                    MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS
                  )
                  if (markOnBossCondition) {
                    await emitFunnelEvents([{
                      encryptJobId: targetJobData.jobInfo.encryptId,
                      encryptBossId: targetJobData.jobInfo.encryptUserId,
                      eventType: JobFunnelEventType.MARKED_NOT_SUIT,
                      eventDate: new Date(),
                      jobSource: JobSource[computedSourceList[currentSourceIndex]?.type],
                      sourceKey: computedSourceList[currentSourceIndex]?.sourceKey,
                      searchKeyword: computedSourceList[currentSourceIndex]?.keyword,
                      filterConditionKey: activeFilterConditionKey ?? undefined,
                      skipReason: markOnBossCondition
                    }])
                    await notSuitConditionHandleMap[markOnBossCondition]()
                    continue continueFind
                  }
                  // 2. if there is no condition to mark Boss, then find the one mark on local db
                  const markOnLocalDbCondition = findConditionByStrategy(
                    notSuitReasonIdToStrategyMap,
                    MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL
                  )
                  if (markOnLocalDbCondition) {
                    await emitFunnelEvents([{
                      encryptJobId: targetJobData.jobInfo.encryptId,
                      encryptBossId: targetJobData.jobInfo.encryptUserId,
                      eventType: JobFunnelEventType.MARKED_NOT_SUIT,
                      eventDate: new Date(),
                      jobSource: JobSource[computedSourceList[currentSourceIndex]?.type],
                      sourceKey: computedSourceList[currentSourceIndex]?.sourceKey,
                      searchKeyword: computedSourceList[currentSourceIndex]?.keyword,
                      filterConditionKey: activeFilterConditionKey ?? undefined,
                      skipReason: markOnLocalDbCondition
                    }])
                    await notSuitConditionHandleMap[markOnLocalDbCondition]()
                    continue continueFind
                  }
                  // 3.
                  const noOpCondition = findConditionByStrategy(
                    notSuitReasonIdToStrategyMap,
                    MarkAsNotSuitOp.NO_OP
                  )
                  if (noOpCondition) {
                    await emitFunnelEvents([{
                      encryptJobId: targetJobData.jobInfo.encryptId,
                      encryptBossId: targetJobData.jobInfo.encryptUserId,
                      eventType: JobFunnelEventType.MARKED_NOT_SUIT,
                      eventDate: new Date(),
                      jobSource: JobSource[computedSourceList[currentSourceIndex]?.type],
                      sourceKey: computedSourceList[currentSourceIndex]?.sourceKey,
                      searchKeyword: computedSourceList[currentSourceIndex]?.keyword,
                      filterConditionKey: activeFilterConditionKey ?? undefined,
                      skipReason: noOpCondition
                    }])
                    await notSuitConditionHandleMap[noOpCondition]()
                    continue continueFind
                  }
                  // #endregion
                  if (
                    // test company again - when allow list not include target company, just skip
                    enableCompanyAllowList && ![...expectCompanySet].find(
                      name => selectedJobData.brandName?.toLowerCase?.()?.includes(name.toLowerCase())
                    ) ||
                    // check if job has been marked as not suit or not active
                    blockJobNotSuit.has(targetJobData.jobInfo.encryptId) ||
                    blockBossNotActive.has(targetJobData.jobInfo.encryptUserId) ||
                    blockJobNotHiring.has(targetJobData.jobInfo.encryptId)
                  ) {
                    // just skip
                    continue continueFind
                  }
                  const startChatButtonInnerHTML = await getStartChatButtonHtml(page)
                  if (startChatButtonInnerHTML !== '立即沟通') {
                    blockBossNotNewChat.add(targetJobData.jobInfo.encryptUserId)
                    continue continueFind
                  }
                  targetJobIndex = tempTargetJobIndexToCheckDetail
                  //#endregion
                }

                if (targetJobIndex < 0 && hasReachLastPage) {
                  // has reach last page and not find target job
                  reject(new Error('CANNOT_FIND_EXCEPT_JOB_IN_THIS_FILTER_CONDITION'))
                  return
                }
              }

              resolve(
                {
                  targetJobIndex,
                  targetJobData
                }
              )
            } catch(err) {
              reject(err)
            }
            finally {
              if (reqHandler) {
                page.off('request', reqHandler)
              }
              if (resHandler) {
                page.off('response', resHandler)
              }
            }
          })
          await waitForSageTimeOrJustContinue({
            tag: 'beforeJobChatStartup',
            hooks
          })
          await sleepWithRandomDelay(1000)
          const startChatButtonInnerHTML = await getStartChatButtonHtml(page)

          if (jobCollectionOnly) {
            await hooks.jobCandidateCollected?.promise(
              buildJobCandidateRecord({
                encryptCurrentUserId: traversalState.encryptUserId,
                profileId: activeJobSearchProfileId,
                jobInfo: targetJobData.jobInfo,
                listJob: selectedJobData,
                matchScore: currentJobMatchScore,
                reasons: currentJobMatchDetail?.reasons ?? [],
                components: currentJobMatchDetail?.components ?? null,
                semanticResult: currentJobMatchDetail?.semanticResult ?? null,
                sourceKey: computedSourceList[currentSourceIndex]?.sourceKey,
                searchKeyword: computedSourceList[currentSourceIndex]?.keyword,
                filterConditionKey: activeFilterConditionKey ?? null
              })
            )
            await emitFunnelEvents([{
              encryptJobId: targetJobData.jobInfo.encryptId,
              encryptBossId: targetJobData.jobInfo.encryptUserId,
              eventType: JobFunnelEventType.CANDIDATE_COLLECTED,
              eventDate: new Date(),
              jobSource: JobSource[computedSourceList[currentSourceIndex]?.type],
              sourceKey: computedSourceList[currentSourceIndex]?.sourceKey,
              searchKeyword: computedSourceList[currentSourceIndex]?.keyword,
              filterConditionKey: activeFilterConditionKey ?? undefined,
              filterConditionJson: activeFilterConditionJson ?? undefined,
              matchScore: currentJobMatchScore ?? undefined
            }])
            traversalState.processedJobIds.add(targetJobData.jobInfo.encryptId)
            await saveTraversalCheckpoint(targetJobData.jobInfo.encryptId)
            await storeStorage(page).catch(() => void 0)
            continue findInCurrentFilterCondition
          }

          await hooks.newChatWillStartup?.promise(targetJobData)
          const startChatButtonProxy = await getStartChatButton(page)
          await sleep(500)
          //#region click the chat button
          await startChatButtonProxy.click()

          const waitAndHandleChatSuccess = async ({ hasGoToChatPage = false } = {}) => {
            await hooks.newChatStartup?.promise(
              targetJobData,
              {
                chatStartupFrom: ChatStartupFrom.AutoFromRecommendList,
                jobSource: JobSource[computedSourceList[currentSourceIndex]?.type],
                sourceKey: computedSourceList[currentSourceIndex]?.sourceKey,
                searchKeyword: computedSourceList[currentSourceIndex]?.keyword,
                filterConditionKey: activeFilterConditionKey ?? undefined
              }
            )
            blockBossNotNewChat.add(targetJobData.jobInfo.encryptUserId)
            traversalState.processedJobIds.add(targetJobData.jobInfo.encryptId)
            await emitFunnelEvents([{
              encryptJobId: targetJobData.jobInfo.encryptId,
              encryptBossId: targetJobData.jobInfo.encryptUserId,
              eventType: JobFunnelEventType.CHAT_STARTED,
              eventDate: new Date(),
              jobSource: JobSource[computedSourceList[currentSourceIndex]?.type],
              sourceKey: computedSourceList[currentSourceIndex]?.sourceKey,
              searchKeyword: computedSourceList[currentSourceIndex]?.keyword,
              filterConditionKey: activeFilterConditionKey ?? undefined,
              filterConditionJson: activeFilterConditionJson ?? undefined,
              matchScore: currentJobMatchScore ?? undefined
            }])
            await saveTraversalCheckpoint(targetJobData.jobInfo.encryptId)

            await storeStorage(page).catch(() => void 0)
            await sleepWithRandomDelay(1500)
            if (hasGoToChatPage) {
              await page.goBack()
              await page.waitForFunction(() => {
                return location.href.startsWith(`https://www.zhipin.com/web/geek/jobs`) && document.readyState === 'complete'
              })
              await sleepWithRandomDelay(2000)
            }
            const closeDialogButtonProxy = await page.$('.greet-boss-dialog .greet-boss-footer .cancel-btn')
            if (closeDialogButtonProxy) {
              await closeDialogButtonProxy.click()
              await sleepWithRandomDelay(2000)
            }
          }
          await handleChatAddFriendResponse({
            page,
            targetJobData,
            waitForSageTime: (args) => waitForSageTimeOrJustContinue({
              ...args,
              hooks
            }),
            onChatSuccess: waitAndHandleChatSuccess,
            onStoreStorage: () => storeStorage(page).catch(() => void 0)
          })
        } catch (err) {
          if (err instanceof Error) {
            switch (err.message) {
              case 'CANNOT_FIND_EXCEPT_JOB_IN_THIS_FILTER_CONDITION': {
                await sleepWithRandomDelay(25 * 1000)
                continue iterateFilterCondition;
              }
              case 'STARTUP_CHAT_ERROR_DUE_TO_TODAY_CHANCE_HAS_USED_OUT': {
                let nextTrySeconds = 60 * 60
                const msg = `Today chance has used out. Just explore positions you\'ve chatted. New chat will be tried to start after ${nextTrySeconds} seconds.`
                hooks.errorEncounter?.call(msg)
                console.error(msg)
                await sleep(nextTrySeconds * 1000)
                throw err
              }
              case 'STARTUP_CHAT_ERROR_WITH_UNKNOWN_ERROR': {
                hooks.errorEncounter?.call([err.message, err.stack].join('\n'))
                throw err
              }
              default: {
                hooks.errorEncounter?.call([err.message, err.stack].join('\n'))
                throw err
              }
            }
          } else {
            hooks.errorEncounter?.call(err)
            throw err
          }
        }
      }
    }
    // for of reach terminal
    if (
      currentSourceIndex + 1 >= computedSourceList.length
    ) {
      hooks.noPositionFoundForCurrentJob?.call()
      hooks.noPositionFoundAfterTraverseAllJob?.call()
      await sleep((20 + 30 * Math.random()) * 1000)
      await Promise.all([
        page.goto(`https://www.zhipin.com/web/geek/jobs`),
        page.waitForNavigation()
      ])
      currentSourceIndex = 0
      lastFilterConditionKey = null
    } else {
      hooks.noPositionFoundForCurrentJob?.call()
      await sleep((10 + 15 * Math.random()) * 1000)
      currentSourceIndex += 1
    }
  }
}

export async function mainLoop (hooks) {
  if (!puppeteer) {
    await initPuppeteer()
  }
  try {
    browser = await puppeteer.launch({
      headless: false,
      ignoreHTTPSErrors: true,
      defaultViewport: {
        width: 1440,
        height: 900 - 140,
      }
    })
    hooks.puppeteerLaunched?.call(browser)
    page = (await browser.pages())[0]
    hooks.pageGotten?.call(page)
    //set cookies
    const bossCookies = readStorageFile('boss-cookies.json')
    const bossLocalStorage = readStorageFile('boss-local-storage.json')
    await hooks.cookieWillSet?.promise({ cookies: bossCookies, browser })
    for(let i = 0; i < bossCookies.length; i++){
      if (Object.hasOwn(bossCookies[i], 'sameSite')) {
        bossCookies[i].sameSite = 'unspecified'
      }
      await page.setCookie(bossCookies[i]);
    }
    await setDomainLocalStorage(browser, localStoragePageUrl, bossLocalStorage)
    await page.bringToFront()
    // __GGR_INJECT_ANTI_ANTI_DEBUGGER__
    await hooks.mainFlowWillLaunch?.promise({
      jobNotMatchStrategy,
      jobNotActiveStrategy,
      expectCityNotMatchStrategy,
      expectWorkExpNotMatchStrategy,
      expectSalaryNotMatchStrategy,
      blockCompanyNameRegMatchStrategy,
      blockJobNotSuit,
      blockBossNotActive,
      blockBossNotNewChat,
      blockJobNotHiring
    })
    await toRecommendPage(hooks)
    // goto search

    // ;await browser.close()
  } catch (err) {
    closeBrowserWindow()
    throw err
  }
}

export async function closeBrowserWindow () {
  browser?.close()
  const browserProcess = browser?.process()
  if (browserProcess) {
    try {
      process.kill(browserProcess.pid)
    }
    catch {}
  }
  browser = null
  page = null
}

async function storeStorage (page) {
  const [
    cookies, localStorage
  ] = await Promise.all([
    page.cookies(),
    page.evaluate(() => {
      return JSON.stringify(window.localStorage)
    }).then(res => JSON.parse(res))
  ])
  return Promise.all(
    [
      writeStorageFile('boss-cookies.json', cookies),
      writeStorageFile('boss-local-storage.json', localStorage),
    ]
  )
}
