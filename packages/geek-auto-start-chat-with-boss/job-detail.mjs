const MATCH_LOGIC_SOME = 2

function testRegExp(value, regExpStr) {
  if (!regExpStr?.trim()) {
    return null
  }
  try {
    return new RegExp(regExpStr, 'im').test(
      String(value ?? '').replace(/\n/g, '')
    )
  } catch {
    return null
  }
}

export function testIfJobTitleOrDescriptionSuit(
  jobInfo,
  matchLogic,
  {
    expectJobNameRegExpStr = '',
    expectJobTypeRegExpStr = '',
    expectJobDescRegExpStr = ''
  } = {}
) {
  const results = [
    testRegExp(jobInfo?.jobName, expectJobNameRegExpStr),
    testRegExp(jobInfo?.positionName, expectJobTypeRegExpStr),
    testRegExp(jobInfo?.postDescription, expectJobDescRegExpStr)
  ].filter((result) => result !== null)
  if (!results.length) {
    return true
  }
  return matchLogic === MATCH_LOGIC_SOME
    ? results.some(Boolean)
    : results.every(Boolean)
}
