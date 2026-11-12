import { sleep, sleepWithRandomDelay } from '@geekgeekrun/utils/sleep.mjs'
import {
  getFilterDropdownElement,
  waitForCityDialogVisible,
  getHotCityElement,
  getAllCityElement
} from './page-adapter/boss-page.mjs'

export async function setFilterCondition(
  page,
  selectedFilters,
  {
    jobFilterConditionsMapByCode,
    industryFilterConditionsMapByCode,
    industryFilterConditionsMapByIndex,
    industryFilterConditionCodeToIndexMap,
    flattedCityList
  }
) {
  const {
    cityList = [],
    salaryList = [],
    experienceList = [],
    degreeList = [],
    scaleList = [],
    industryList = []
  } = selectedFilters

  const placeholderTexts = ['城市', '薪资待遇', '工作经验', '学历要求', '公司行业', '公司规模']
  const optionKaPrefixes = ['switch_city_dialog_open', 'sel-job-rec-salary-', 'sel-job-rec-exp-', 'sel-job-rec-degree-', 'sel-industry-', 'sel-job-rec-scale-']
  const conditionArr = [cityList, salaryList, experienceList, degreeList, industryList, scaleList]

  console.log('current filter condition----')
  for (let i = 0; i < placeholderTexts.length; i++) {
    const text = placeholderTexts[i]
    const condition = conditionArr[i]
    console.log(`${text}：`, condition.length === 0 ? '不限' : condition.map(code => {
      if (text === '公司行业') {
        return industryFilterConditionsMapByCode[code]?.name ?? code
      } else {
        return jobFilterConditionsMapByCode[code]?.name ?? code
      }
    }).join('，'))
  }
  console.log('----------------------------')
  for (let i = 0; i < placeholderTexts.length; i++) {
    const placeholderText = placeholderTexts[i]
    const filterDropdownProxy = await getFilterDropdownElement(page, placeholderText)
    if (!filterDropdownProxy) {
      continue
    }

    const currentFilterConditions = conditionArr[i]
    const filterDropdownCssList = await filterDropdownProxy.evaluate(el => Array.from(el.classList))
    if (placeholderText === '城市') {
      const onPageSelectedCity = filterDropdownCssList.includes('active')
        ? (await filterDropdownProxy.evaluate(el => el.textContent.trim()))
        : null
      if (!onPageSelectedCity && !currentFilterConditions.length) {
        continue
      } else if (onPageSelectedCity === (currentFilterConditions[0] ?? null)) {
        continue
      } else {
        if (!currentFilterConditions.length) {
          const clearButtonHandle = await page.$(`.page-jobs-main .filter-condition-inner [ka="empty-filter"]`)
          await clearButtonHandle.click()
        } else {
          await filterDropdownProxy?.click()
          await waitForCityDialogVisible(page)
          await page.waitForSelector('.city-select-wrapper')
          let targetCityElJsHandle = await getHotCityElement(
            page,
            currentFilterConditions[0]
          )
          if (!targetCityElJsHandle) {
            const targetCityItem = flattedCityList.find(it => it.name === currentFilterConditions[0])
            if (!targetCityItem) {
              continue
            }
            const firstChar = targetCityItem.firstChar
            const targetCityCharListEntryHandle = await page.$(`xpath///*[contains(@class, "city-select-dialog")]//*[contains(@class, "city-select-wrapper")]//ul[contains(@class, "city-char-list")]//li[contains(text(), '${firstChar.toUpperCase()}')]`)
            await targetCityCharListEntryHandle.click()
            targetCityElJsHandle = await getAllCityElement(
              page,
              currentFilterConditions[0]
            )
          }
          if (!targetCityElJsHandle) {
            continue
          }
          await targetCityElJsHandle.click()
          await sleep(1000)
        }
      }
    } else {
      if (!filterDropdownCssList.includes('is-select') && !currentFilterConditions.length) {
        continue
      } else {
        await filterDropdownProxy.scrollIntoView()
        const filterDropdownElBBox = await filterDropdownProxy.boundingBox()
        await page.mouse.move(
          filterDropdownElBBox.x + filterDropdownElBBox.width / 2,
          filterDropdownElBBox.y + filterDropdownElBBox.height / 2
        )
        await sleepWithRandomDelay(500)

        const optionKaPrefix = optionKaPrefixes[i]
        if (!currentFilterConditions.length) {
          if (placeholderText === '公司行业') {
            const activeOptionElAtCurrentFilterProxyList = await page.$$(`.page-jobs-main .filter-condition-inner .active[ka^="${optionKaPrefix}"]`)
            for (const it of activeOptionElAtCurrentFilterProxyList) {
              await it.click()
            }
          } else {
            const buxianOptionElProxy = await page.$(`.page-jobs-main .filter-condition-inner [ka="${optionKaPrefix}${0}"]`)
            await buxianOptionElProxy.click()
          }
        } else {
          const activeOptionElAtCurrentFilterProxyList = await page.$$(`.page-jobs-main .filter-condition-inner .active[ka^="${optionKaPrefix}"]`)
          const activeOptionValues = (await Promise.all(
            activeOptionElAtCurrentFilterProxyList.map(elProxy => {
              return elProxy.evaluate((el) => {
                return el.getAttribute('ka')
              })
            })
          )).map(it => it.replace(optionKaPrefix, '')).map(Number)
          if (placeholderText !== '薪资待遇') {
            for (let j = 0; j < activeOptionValues.length; j++) {
              let activeValue
              if (placeholderText === '公司行业') {
                activeValue = industryFilterConditionsMapByIndex[activeOptionValues[j]]?.code
              } else {
                activeValue = activeOptionValues[j]
              }
              const activeOptionElProxy = activeOptionElAtCurrentFilterProxyList[j]
              if (!currentFilterConditions.includes(activeValue)) {
                await activeOptionElProxy.click()
              }
            }
          }
          const conditionToCheck = currentFilterConditions.filter(it => {
            if (placeholderText === '公司行业') {
              return !activeOptionValues.map(value => industryFilterConditionsMapByIndex[value].code).includes(it)
            } else {
              return !activeOptionValues.includes(it)
            }
          })
          for (let j = 0; j < conditionToCheck.length; j++) {
            let optionValue
            if (placeholderText === '公司行业') {
              optionValue = industryFilterConditionCodeToIndexMap[conditionToCheck[j]]
            } else {
              optionValue = conditionToCheck[j]
            }
            await sleepWithRandomDelay(500)
            await filterDropdownProxy.scrollIntoView()
            const filterDropdownElBBox = await filterDropdownProxy.boundingBox()
            await page.mouse.move(
              filterDropdownElBBox.x + filterDropdownElBBox.width / 2,
              filterDropdownElBBox.y + filterDropdownElBBox.height / 2
            )
            await sleepWithRandomDelay(500)
            const optionElProxy = await page.$(`.page-jobs-main .filter-condition-inner [ka="${optionKaPrefix}${optionValue}"]`)
            if (!optionElProxy) {
              continue
            }
            await optionElProxy.click()
          }
          const navBarLogoElProxy = await page.$(`[ka="header-home-logo"]`)
          if (navBarLogoElProxy) {
            const navBarLogoElBBox = await navBarLogoElProxy.boundingBox()
            await page.mouse.move(
              navBarLogoElBBox.x + navBarLogoElBBox.width / 2,
              navBarLogoElBBox.y + navBarLogoElBBox.height / 2
            )
          }
        }
        await sleepWithRandomDelay(500)
      }
    }
  }
}
