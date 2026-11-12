import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculateTotalCombinations,
  combineFiltersWithConstraintsGenerator,
  getFilterConditionKey,
  isFilterConditionEmpty
} from '../packages/geek-auto-start-chat-with-boss/combineCalculator.mjs'

const filters = {
  cityList: [1, 2],
  salaryList: [3],
  experienceList: [4, 5],
  degreeList: [],
  scaleList: [],
  industryList: []
}

test('combineFiltersWithConstraintsGenerator excludes empty conditions', () => {
  const conditions = Array.from(
    combineFiltersWithConstraintsGenerator(filters, {
      includeEmptyCondition: false
    })
  )

  assert.equal(conditions.length, 23)
  assert.equal(conditions.some(isFilterConditionEmpty), false)
})

test('combineFiltersWithConstraintsGenerator prioritizes specific conditions and caps output', () => {
  const conditions = Array.from(
    combineFiltersWithConstraintsGenerator(filters, {
      includeEmptyCondition: false,
      maxCombinations: 3
    })
  )

  assert.equal(conditions.length, 3)
  assert.deepEqual(conditions[0], {
    cityList: [1],
    salaryList: [3],
    experienceList: [4, 5],
    degreeList: [],
    scaleList: [],
    industryList: []
  })
})

test('filter condition helpers normalize order and detect empty conditions', () => {
  assert.equal(
    getFilterConditionKey({
      cityList: [2, 1],
      salaryList: []
    }),
    getFilterConditionKey({
      cityList: [1, 2],
      salaryList: []
    })
  )
  assert.equal(
    isFilterConditionEmpty({
      cityList: [],
      salaryList: []
    }),
    true
  )
})

test('calculateTotalCombinations keeps the existing cardinality semantics', () => {
  assert.equal(calculateTotalCombinations(filters, false), 23)
})
