//# region get all combinations
// 使用迭代生成组合
function combine(arr, min, max) {
  const result = []
  const n = arr.length

  // 生成长度在[min, max]范围内的所有组合
  for (let r = min; r <= Math.min(max, n); r++) {
    const indices = Array(r)
      .fill(0)
      .map((_, i) => i) // 初始化索引
    result.push(indices.map((i) => arr[i])) // 保存初始组合

    while (true) {
      let i = r - 1

      // 从后往前找第一个未到达上界的索引
      while (i >= 0 && indices[i] === i + n - r) {
        i--
      }

      // 没有更多组合时退出
      if (i < 0) break

      indices[i]++

      // 更新接下来的所有索引
      for (let j = i + 1; j < r; j++) {
        indices[j] = indices[j - 1] + 1
      }

      result.push(indices.map((j) => arr[j]))
    }
  }

  return result
}

// 生成符合"0"限制的组合
function combineWithZero(arr, min, max) {
  let combineResult;
  if (!Array.isArray(arr)) {
    arr = []
  }
  if (arr.includes(0)) {
    // 如果包含 0，0不参与组合
    combineResult = [].concat(
      combine(
        arr.filter((x) => x !== 0),
        min,
        max
      )
    );
  } else {
    // 如果不包含 0，直接生成组合
    combineResult = [].concat(combine(arr, min, max));
  }
  return combineResult;
}

function sortCombinationsBySpecificity(combinations) {
  return combinations.slice().sort((a, b) => {
    if (a.length !== b.length) {
      return b.length - a.length
    }
    return JSON.stringify(a).localeCompare(JSON.stringify(b))
  })
}

export function getFilterConditionKey(condition) {
  const normalized = {}
  for (const key of Object.keys(condition ?? {}).sort()) {
    const value = condition[key]
    normalized[key] = Array.isArray(value) ? [...value].sort() : value
  }
  return JSON.stringify(normalized)
}

export function isFilterConditionEmpty(condition) {
  return Object.keys(condition ?? {}).every((key) => !condition[key]?.length)
}

export function* combineFiltersWithConstraintsGenerator(
  selectedFilters,
  {
    includeEmptyCondition = true,
    maxCombinations = Number.POSITIVE_INFINITY
  } = {}
) {
  const { cityList, salaryList, experienceList, degreeList, scaleList, industryList } =
    selectedFilters ?? {};

  // 生成符合限制条件的组合
  const cityComb = sortCombinationsBySpecificity(combineWithZero(cityList, 0, 1)) // City: 0-1 个
  const salaryComb = sortCombinationsBySpecificity(combineWithZero(salaryList, 0, 1)) // Salary: 0-1 个
  const experienceComb = sortCombinationsBySpecificity(combineWithZero(experienceList, 0, experienceList.length)) // Experience: 0 个或更多
  const degreeComb = sortCombinationsBySpecificity(combineWithZero(degreeList, 0, degreeList.length)) // Degree: 0 个或更多
  const scaleComb = sortCombinationsBySpecificity(combineWithZero(scaleList, 0, scaleList.length)) // Scale: 0 个或更多
  const industryComb = sortCombinationsBySpecificity(combineWithZero(industryList, 0, 3)) // Industry: 0-3 个
  const limit = Number.isFinite(Number(maxCombinations))
    ? Math.max(0, Math.floor(Number(maxCombinations)))
    : Number.POSITIVE_INFINITY
  let emittedCount = 0

  // 通过迭代生成所有组合
  for (const city of cityComb) {
    for (const salary of salaryComb) {
      for (const experience of experienceComb) {
        for (const degree of degreeComb) {
          for (const scale of scaleComb) {
            for (const industry of industryComb) {
              const condition = {
                cityList: city,
                salaryList: salary,
                experienceList: experience,
                degreeList: degree,
                scaleList: scale,
                industryList: industry
              }
              if (!includeEmptyCondition && isFilterConditionEmpty(condition)) {
                continue
              }
              if (emittedCount >= limit) {
                return
              }
              emittedCount++
              yield condition
            }
          }
        }
      }
    }
  }
}
//#endregion

//#region get count of combinations

// 计算符合限制条件的组合数量
export function calculateTotalCombinations(selectedFilters, includeEmptyCondition) {
  const {
    cityList = [],
    salaryList = [],
    experienceList = [],
    degreeList = [],
    scaleList = [],
    industryList = []
  } = selectedFilters

  // 生成符合限制条件的组合
  const cityComb = combineWithZero(cityList, 0, 1) // City: 0-1 个
  const salaryComb = combineWithZero(salaryList, 0, 1) // Salary: 0-1 个
  const experienceComb = combineWithZero(experienceList, 0, experienceList.length) // Experience: 0 个或更多
  const degreeComb = combineWithZero(degreeList, 0, degreeList.length) // Degree: 0 个或更多
  const scaleComb = combineWithZero(scaleList, 0, scaleList.length) // Scale: 0 个或更多
  const industryComb = combineWithZero(industryList, 0, 3) // Industry: 0-3 个

  let result = [cityComb, salaryComb, experienceComb, degreeComb, scaleComb, industryComb].reduce((accu, cur) => {
    return accu * cur.length
  }, 1)
  if (!includeEmptyCondition) {
    result -= 1
  }
  return result
}
//#endregion

export function checkAnyCombineBossRecommendFilterHasCondition(value) {
  if (!Object.keys(value ?? {}).length) {
    return false
  }
  return Object.keys(value).some((k) => {
    return !!value[k]?.length
  })
}

export function getStaticCombineFilterKey(condition) {
  const kAsO = {}
  for (const key of Object.keys(condition ?? []).sort()) {
    if (condition[key] === null || condition[key] === undefined) {
      continue
    }
    kAsO[key] = condition[key]
  }
  return JSON.stringify(kAsO)
}

export function formatStaticCombineFilters(rawStaticCombineRecommendJobFilterConditions) {
  rawStaticCombineRecommendJobFilterConditions = JSON.parse(JSON.stringify(rawStaticCombineRecommendJobFilterConditions))
  const map = new Map()
  for (const condition of rawStaticCombineRecommendJobFilterConditions ?? []) {    
    const key = getStaticCombineFilterKey(condition)
    map.set(key, condition)
  }
  const conditions = Array.from(map.values())
  const result = conditions.map((condition) => {
    return {
      cityList: condition.city ? [condition.city] : [],
      salaryList: condition.salary ? [condition.salary] : [],
      experienceList: condition.experience ? [condition.experience] : [],
      degreeList: condition.degree ? [condition.degree] : [],
      scaleList: condition.scale ? [condition.scale] : [],
      industryList: condition.industry ? [condition.industry] : []
    }
  })
  if (!result.length) {
    result.push({
      cityList: [],
      salaryList: [],
      experienceList: [],
      degreeList: [],
      scaleList: [],
      industryList: []
    })
  }
  return result
}
