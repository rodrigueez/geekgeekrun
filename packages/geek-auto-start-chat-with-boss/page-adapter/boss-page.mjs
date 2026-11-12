export const BOSS_PAGE_SELECTORS = {
  recommendEntry: '.c-expect-select a[ka="jobs_recommend_tab_click"]',
  expectEntry: '.expect-job-entry',
  jobMain: '.page-jobs-main',
  jobList: '.job-list-container .rec-job-list',
  emptyJobList: '.recommend-result-job .job-empty-wrapper',
  jobListLoading: '.job-recommend-result .job-rec-loading',
  jobDetail: '.job-detail-box',
  jobDetailData: '.job-detail-box',
  currentJob: '.page-jobs-main',
  expectSelect: '.c-expect-select',
  searchInput: '.search-box input',
  startChatButton: '.job-detail-box .op-btn.op-btn-chat',
  notSuitableButton: '.job-detail-box .job-detail-operate .not-suitable',
  filterBar: '.page-jobs-main .filter-condition-inner',
  cityDialog: '.city-select-dialog',
  cityWrapper: '.city-select-wrapper',
  hotCityList: '.city-select-dialog .city-select-wrapper ul.city-list-hot li',
  allCityList: '.city-select-dialog .city-select-wrapper .list-select-list a',
  filterClearButton: '.page-jobs-main .filter-condition-inner [ka="empty-filter"]'
}

export async function getRecommendEntryActive(page, selector = BOSS_PAGE_SELECTORS.recommendEntry) {
  return page.evaluate((selector) => {
    return document.querySelector(selector)?.classList?.contains('active') ?? false
  }, selector)
}

export async function getExpectEntryActive(page, selector, index) {
  return page.evaluate(
    ({ selector, index }) => {
      return document
        .querySelector(`${selector}:nth-child(${index + 1})`)
        ?.classList?.contains('active') ?? false
    },
    { selector, index }
  )
}

export async function getSearchQuery(page) {
  const elHandle = await page.$(BOSS_PAGE_SELECTORS.jobMain)
  return elHandle?.evaluate((el) => el?.__vue__?.formData?.query)
}

export async function getExpectJobList(page) {
  return page.evaluate(() => {
    return document.querySelector('.c-expect-select')?.__vue__?.expectList
  })
}

export async function isJobListLoading(page) {
  return page.evaluate(() => {
    return !document.querySelector('.job-recommend-result .job-rec-loading')
  })
}

export async function waitForJobListIdle(page, timeout = 15 * 1000) {
  await page.waitForFunction(() => {
    return !document.querySelector('.job-recommend-result .job-rec-loading')
  }, { timeout }).catch(() => void 0)
}

export async function getPageQuery(page) {
  return page.evaluate(() => new URL(location.href).searchParams.toString())
}

export async function getJobList(page) {
  return page.evaluate(() => {
    return document.querySelector('.page-jobs-main')?.__vue__?.jobList
  })
}

export async function getHasMore(page) {
  return page.evaluate(() => {
    return !(document.querySelector('.page-jobs-main')?.__vue__?.hasMore)
  })
}

export async function scrollJobIntoView(page, index) {
  const block = Math.random() > 0.5 ? 'center' : 'end'
  return page.evaluate(
    ({ index, block }) => {
      const targetEl = document.querySelector('ul.rec-job-list')?.children?.[index]
      targetEl?.scrollIntoView({
        behavior: 'smooth',
        block
      })
    },
    { index, block }
  )
}

export async function getJobDetail(page) {
  return page.evaluate(() => {
    return document.querySelector('.job-detail-box')?.__vue__?.data
  })
}

export async function getCurrentJob(page) {
  return page.evaluate(() => {
    return document.querySelector('.page-jobs-main')?.__vue__?.currentJob
  })
}

export async function getStartChatButtonHtml(page) {
  return page.evaluate(() => {
    return document
      .querySelector('.job-detail-box .op-btn.op-btn-chat')
      ?.innerHTML?.trim()
  })
}

export async function getStartChatButton(page) {
  return page.$(BOSS_PAGE_SELECTORS.startChatButton)
}

export async function getNotSuitableButton(page) {
  return page.$(BOSS_PAGE_SELECTORS.notSuitableButton)
}

export async function getFilterDropdownElement(page, placeholderText) {
  const jsHandle = await page.evaluateHandle((placeholderText) => {
    if (placeholderText === '城市') {
      return document.querySelector(
        '.page-jobs-main .filter-condition-inner [ka="switch_city_dialog_open"]'
      )
    }
    const filterBar = document.querySelector(
      '.page-jobs-main .filter-condition-inner'
    )
    const dropdownEntry = filterBar?.__vue__?.$children?.find(
      (it) => it.placeholder === placeholderText
    )
    return dropdownEntry?.$el
  }, placeholderText)
  return jsHandle?.asElement()
}

export async function isCityDialogVisible(page) {
  return page.evaluate(() => {
    const dialogEl = document.querySelector('.city-select-dialog')
    return Boolean(dialogEl && window.getComputedStyle(dialogEl).display !== 'none')
  })
}

export async function waitForCityDialogVisible(page) {
  await page.waitForFunction(() => {
    const dialogEl = document.querySelector('.city-select-dialog')
    return Boolean(dialogEl && window.getComputedStyle(dialogEl).display !== 'none')
  })
}

export async function getHotCityElement(page, cityName) {
  const jsHandle = await page.evaluateHandle((cityName) => {
    return (
      [
        ...document.querySelectorAll(
          '.city-select-dialog .city-select-wrapper ul.city-list-hot li'
        )
      ].find((it) => it.textContent.trim() === cityName) ?? null
    )
  }, cityName)
  return jsHandle?.asElement()
}

export async function getAllCityElement(page, cityName) {
  const jsHandle = await page.evaluateHandle((cityName) => {
    return (
      [
        ...document.querySelectorAll(
          '.city-select-dialog .city-select-wrapper .list-select-list a'
        )
      ].find((it) => it.textContent.trim() === cityName) ?? null
    )
  }, cityName)
  return jsHandle?.asElement()
}
