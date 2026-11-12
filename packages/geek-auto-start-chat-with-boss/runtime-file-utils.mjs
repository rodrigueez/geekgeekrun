import fs from 'node:fs'
import fsPromise from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

import defaultDingtalkConf from './default-config-file/dingtalk.json' assert {type: 'json'}
import defaultBossConf from './default-config-file/boss.json' assert {type: 'json'}
import defaultTargetCompanyListConf from './default-config-file/target-company-list.json' assert {type: 'json'}
import defaultLlmConf from './default-config-file/llm.json' assert { type: 'json' }

import defaultBossCookieStorage from './default-storage-file/boss-cookies.json' assert { type: 'json' }
import defaultBossLocalStorageStorage from './default-storage-file/boss-local-storage.json' assert { type: 'json' }
import defaultJobNotSuitReasonCodeToTextCacheStorage from './default-storage-file/job-not-suit-reason-code-to-text-cache.json' assert { type: 'json' }
import defaultCommonJobConditionConfig from './default-config-file/common-job-condition-config.json' assert { type: 'json' }
export const configFileNameList = ['boss.json', 'dingtalk.json', 'target-company-list.json', 'llm.json', 'common-job-condition-config.json']

const defaultConfigFileContentMap = {
  'boss.json': JSON.stringify(defaultBossConf),
  'dingtalk.json': JSON.stringify(defaultDingtalkConf),
  'target-company-list.json': JSON.stringify(defaultTargetCompanyListConf),
  'llm.json': JSON.stringify(defaultLlmConf),
  'common-job-condition-config.json': JSON.stringify(defaultCommonJobConditionConfig)
}
const runtimeFolderPath = path.join(os.homedir(), '.geekgeekrun')
export const configFolderPath = path.join(
  runtimeFolderPath,
  'config'
)
const buildTempFilePath = (filePath) =>
  `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`

const writeFileAtomic = (filePath, fileContent, { isSync } = {}) => {
  const tempFilePath = buildTempFilePath(filePath)
  if (isSync) {
    try {
      fs.writeFileSync(tempFilePath, fileContent)
      fs.renameSync(tempFilePath, filePath)
    } catch (err) {
      try {
        fs.existsSync(tempFilePath) && fs.unlinkSync(tempFilePath)
      } catch {}
      throw err
    }
    return
  }
  return fsPromise
    .writeFile(tempFilePath, fileContent)
    .then(() => fsPromise.rename(tempFilePath, filePath))
    .catch(async (err) => {
      try {
        await fsPromise.unlink(tempFilePath)
      } catch {}
      throw err
    })
}

// 解析失败时保留现场，避免把用户的文件直接删掉（resumes.json 没有默认值，删掉就真的丢了）。
const backupBrokenFile = (filePath) => {
  const backupPath = `${filePath}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}.bak`
  try {
    fs.renameSync(filePath, backupPath)
    console.warn(`配置文件解析失败，已备份到 ${backupPath}`)
  } catch {
    try {
      fs.existsSync(filePath) && fs.unlinkSync(filePath)
    } catch {}
  }
}

export const writeConfigFile = async (fileName, content, { isSync } = {}) => {
  const filePath = path.join(configFolderPath, fileName)
  const fileContent = JSON.stringify(content)
  return writeFileAtomic(filePath, fileContent, { isSync })
}
if (
  !fs.existsSync(
    path.join(configFolderPath, 'common-job-condition-config.json')
  )
) {
  let bossConfig = null
  if (
    fs.existsSync(
      path.join(configFolderPath, 'boss.json')
    )
  ) {
    fs.existsSync(
      path.join(configFolderPath, 'boss.json')
    )
    try {
      bossConfig = JSON.parse(
        fs.readFileSync(
          path.join(configFolderPath, 'boss.json')
        )
      )
    }
    catch {}
  }
  if (bossConfig) {
    Object.keys(defaultCommonJobConditionConfig).forEach(
      key => {
        if (Object.hasOwn(bossConfig, key)) {
          defaultCommonJobConditionConfig[key] = bossConfig[key]
        }
      }
    )
    let {
      expectJobRegExpStr,
      expectJobNameRegExpStr,
      expectJobTypeRegExpStr,
      expectJobDescRegExpStr,
    } = bossConfig
    if (
      expectJobRegExpStr &&
      !expectJobNameRegExpStr &&
      !expectJobTypeRegExpStr &&
      !expectJobDescRegExpStr
    ) {
      expectJobNameRegExpStr = expectJobRegExpStr
      expectJobTypeRegExpStr = expectJobRegExpStr
      expectJobDescRegExpStr = expectJobRegExpStr
    }
    Object.assign(defaultCommonJobConditionConfig, {
      expectJobNameRegExpStr,
      expectJobTypeRegExpStr,
      expectJobDescRegExpStr
    })
  }
  let targetCompanyList = null
  if (
    fs.existsSync(
      path.join(configFolderPath, 'target-company-list.json')
    )
  ) {
    targetCompanyList = JSON.parse(
      fs.readFileSync(
        path.join(configFolderPath, 'target-company-list.json')
      )
    )
  }
  if (targetCompanyList) {
    defaultCommonJobConditionConfig.expectCompanies = targetCompanyList ?? []
  }
  writeConfigFile('common-job-condition-config.json', defaultCommonJobConditionConfig, { isSync: true })
  if (bossConfig) {
    if (!bossConfig.fieldsForUseCommonConfig) {
      bossConfig.fieldsForUseCommonConfig = {}
    }
    writeConfigFile('boss.json', bossConfig, { isSync: true })
  }
}

if (
  fs.existsSync(path.join(configFolderPath, 'boss.json'))
) {
  let bossConfig = null
  try {
    bossConfig = JSON.parse(
      fs.readFileSync(path.join(configFolderPath, 'boss.json'))
    )
  }
  catch {}
  if (
    bossConfig &&
    !Object.hasOwn(bossConfig, 'maxRecommendJobFilterCombinations')
  ) {
    const hasFilterConditions = Object.values(
      bossConfig.anyCombineRecommendJobFilter ?? {}
    ).some(value => Array.isArray(value) && value.length > 0)
    if (
      hasFilterConditions &&
      bossConfig.isSkipEmptyConditionForCombineRecommendJobFilter === false
    ) {
      bossConfig.isSkipEmptyConditionForCombineRecommendJobFilter = true
    }
    bossConfig.maxRecommendJobFilterCombinations = 500
    writeConfigFile('boss.json', bossConfig, { isSync: true })
  }
}

const ensureRuntimeFolderPathExist = () => {
  if (!fs.existsSync(runtimeFolderPath)) {
    fs.mkdirSync(runtimeFolderPath)
  }
  ;['config', 'storage'].forEach(dirPath => {
    if (!fs.existsSync(
      path.join(runtimeFolderPath, dirPath)
    )) {
      fs.mkdirSync(
        path.join(runtimeFolderPath, dirPath)
      )
    }
  })
}
export const ensureConfigFileExist = () => {
  ensureRuntimeFolderPathExist()
  ;configFileNameList.forEach(
    fileName => {
      if (!fs.existsSync(
        path.join(configFolderPath, fileName)
      )) {
        fs.writeFileSync(
          path.join(configFolderPath, fileName),
          defaultConfigFileContentMap[fileName]
        )
      }
    }
  )
}

export const readConfigFile = (fileName) => {
  const joinedPath = path.join(configFolderPath, fileName)
  if (!fs.existsSync(
    joinedPath
  )) {
    ensureConfigFileExist()
  }

  let o
  try {
    o = JSON.parse(
      fs.readFileSync(joinedPath)
    )
  } catch {
    fs.existsSync(joinedPath) && backupBrokenFile(joinedPath)
    if (defaultConfigFileContentMap[fileName]) {
      ensureConfigFileExist()
      o = JSON.parse(defaultConfigFileContentMap[fileName])
    } else {
      o = null
    }
  }

  return o
}

export const storageFilePath = path.join(
  runtimeFolderPath,
  'storage'
)
export const storageFileNameList = ['boss-cookies.json', 'boss-local-storage.json', 'job-not-suit-reason-code-to-text-cache.json']

const defaultStorageFileContentMap = {
  'boss-cookies.json': JSON.stringify(defaultBossCookieStorage),
  'boss-local-storage.json': JSON.stringify(defaultBossLocalStorageStorage),
  'job-not-suit-reason-code-to-text-cache.json': JSON.stringify(defaultJobNotSuitReasonCodeToTextCacheStorage)
}
export const ensureStorageFileExist = () => {
  ensureRuntimeFolderPathExist()
  ;storageFileNameList.forEach(
    fileName => {
      if (!fs.existsSync(
        path.join(storageFilePath, fileName)
      )) {
        fs.writeFileSync(
          path.join(storageFilePath, fileName),
          defaultStorageFileContentMap[fileName]
        )
      }
    }
  )
}

export const readStorageFile = (fileName, { isJson } = {}) => {
  isJson = isJson ?? true
  const joinedPath = path.join(storageFilePath, fileName)

  if (!fs.existsSync(
    joinedPath
  )) {
    ensureStorageFileExist()
  }

  let o
  try {
    const content = fs.readFileSync(joinedPath)
    if (isJson) {
      o = JSON.parse(content)
    }
    else {
      o = content.toString()
    }
  } catch {
    fs.existsSync(joinedPath) && backupBrokenFile(joinedPath)
    ensureStorageFileExist()
    if (isJson) {
      o = JSON.parse(defaultStorageFileContentMap[fileName] ?? 'null')
    }
    else {
      o = defaultStorageFileContentMap[fileName] ?? null
    }
  }

  return o
}

export const writeStorageFile = async (fileName, content, { isJson } = {}) => {
  isJson = isJson ?? true
  const filePath = path.join(storageFilePath, fileName)
  let fileContent
  if (isJson) {
    fileContent = JSON.stringify(content)
  } else {
    fileContent = content
  }
  return writeFileAtomic(filePath, fileContent)
}

export const getPublicDbFilePath = () => {
  return path.join(storageFilePath, 'public.db')
}
