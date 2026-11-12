function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase()
}

function isCompanyAllowed(job, companyAllowList) {
  if (!companyAllowList?.length) {
    return true
  }
  const brandName = normalizeText(job?.brandName)
  return companyAllowList.some((name) =>
    brandName.includes(normalizeText(name))
  )
}

export function getJobListSkipReason(
  job,
  {
    expectCityList = [],
    expectWorkExpList = [],
    expectCityNotMatchStrategy = 3,
    expectWorkExpNotMatchStrategy = 3,
    isSalaryFilterEnabled = false,
    expectSalaryNotMatchStrategy = 3,
    blockCompanyNameRegExp = null,
    blockCompanyNameRegMatchStrategy = 3,
    companyAllowList = [],
    isNoOpStrategy = (strategy) => strategy === 3,
    blockJobNotSuit,
    blockBossNotActive,
    blockBossNotNewChat,
    blockJobNotHiring,
    processedJobIds,
    isSalaryParseable = () => true,
    isSalarySuit = () => true
  } = {}
) {
  if (blockJobNotSuit?.has(job?.encryptJobId)) {
    return 'JOB_ALREADY_MARKED_NOT_SUIT'
  }
  if (blockBossNotActive?.has(job?.encryptBossId)) {
    return 'BOSS_ALREADY_MARKED_INACTIVE'
  }
  if (blockBossNotNewChat?.has(job?.encryptBossId)) {
    return 'BOSS_ALREADY_CHATTED'
  }
  if (blockJobNotHiring?.has(job?.encryptJobId)) {
    return 'JOB_NOT_HIRING'
  }
  if (processedJobIds?.has(job?.encryptJobId)) {
    return 'PROCESSED_RECENTLY'
  }
  if (!isCompanyAllowed(job, companyAllowList)) {
    return 'COMPANY_NOT_IN_ALLOW_LIST'
  }
  if (!isSalaryParseable(job)) {
    return 'SALARY_UNPARSEABLE'
  }

  const cityMismatch =
    expectCityList.length && !expectCityList.includes(job?.cityName)
  if (cityMismatch && isNoOpStrategy(expectCityNotMatchStrategy)) {
    return 'CITY_NOT_SUIT'
  }

  const workExpMismatch =
    expectWorkExpList.length &&
    !expectWorkExpList.includes(job?.jobExperience)
  if (workExpMismatch && isNoOpStrategy(expectWorkExpNotMatchStrategy)) {
    return 'WORK_EXP_NOT_SUIT'
  }

  const salaryMismatch = isSalaryFilterEnabled && !isSalarySuit(job)
  if (salaryMismatch && isNoOpStrategy(expectSalaryNotMatchStrategy)) {
    return 'SALARY_NOT_SUIT'
  }

  if (
    blockCompanyNameRegExp &&
    blockCompanyNameRegExp.test(job?.brandName ?? '') &&
    isNoOpStrategy(blockCompanyNameRegMatchStrategy)
  ) {
    return 'COMPANY_BLOCKED'
  }

  return null
}
