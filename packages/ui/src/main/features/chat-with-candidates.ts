import {
  readConfigFile,
  readStorageFile,
  writeConfigFile
} from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { sleep } from '@geekgeekrun/utils/sleep.mjs'
import {
  getJobCandidatesByStatus,
  recordCandidateChat,
  setJobCandidateStatus
} from '../flow/OPEN_SETTING_WINDOW/utils/db'
import { mainWindow } from '../window/mainWindow'

const QUOTA_FILE_NAME = 'candidate-chat-quota.json'
const DETAIL_URL_PREFIX = 'https://www.zhipin.com/job_detail/'
const CHAT_BUTTON_SELECTOR = 'a.btn.btn-startchat'
const CHAT_DIALOG_SELECTOR = '.greet-boss-dialog'

const STATUS = {
  CANDIDATE: 1,
  QUEUED: 2,
  CHATTING: 3,
  CHATTED: 4,
  INVALID: 5,
  EXCLUDED: 6
}

function todayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`
}

function readQuota() {
  const raw = readConfigFile(QUOTA_FILE_NAME)
  if (!raw || raw.date !== todayKey()) {
    return { date: todayKey(), count: 0 }
  }
  return {
    date: raw.date,
    count: Number(raw.count) || 0
  }
}

async function writeQuota(quota) {
  await writeConfigFile(QUOTA_FILE_NAME, quota)
}

function sleepWithRandomDelay(min, max) {
  return sleep(min + Math.floor(Math.random() * Math.max(max - min, 1)))
}

function notifyProgress(payload) {
  mainWindow?.webContents.send('candidate-chat-progress', payload)
}

async function detectChatStarted(page) {
  return await page.evaluate(
    ({ dialogSelector }) => {
      if (document.querySelector(dialogSelector)) {
        return 'dialog'
      }
      const buttons = [...document.querySelectorAll('a.btn.btn-startchat')]
      if (buttons.some((el) => (el.textContent ?? '').trim() === '继续沟通')) {
        return 'button'
      }
      return null
    },
    { dialogSelector: CHAT_DIALOG_SELECTOR }
  )
}

async function closeChatDialog(page) {
  const closeButton = await page.$(`${CHAT_DIALOG_SELECTOR} .cancel-btn`)
  if (closeButton) {
    await closeButton.click().catch(() => void 0)
    await sleepWithRandomDelay(1200, 2000)
  }
}

export async function chatWithCandidates({
  batchSize = 10,
  dailyLimit = 20,
  profileId = '',
  onlyJobId = ''
}: {
  batchSize?: number
  dailyLimit?: number
  profileId?: string
  onlyJobId?: string
} = {}) {
  const quota = readQuota()
  const remainingToday = Math.max(dailyLimit - quota.count, 0)
  if (remainingToday <= 0) {
    return {
      ok: false,
      reason: 'DAILY_LIMIT_REACHED',
      attempted: 0,
      chatStarted: 0,
      remainingToday: 0
    }
  }

  const fetchedCandidates = (await getJobCandidatesByStatus({
    statusList: [STATUS.QUEUED],
    profileId,
    limit: onlyJobId ? 200 : Math.min(batchSize, remainingToday)
  })) as Array<{ encryptJobId: string; encryptCurrentUserId: string; profileId: string }>

  const candidates = onlyJobId
    ? fetchedCandidates.filter((candidate) => candidate.encryptJobId === onlyJobId)
    : fetchedCandidates

  if (!candidates.length) {
    return {
      ok: false,
      reason: 'NO_QUEUED_CANDIDATE',
      attempted: 0,
      chatStarted: 0,
      remainingToday
    }
  }

  const cookies = readStorageFile('boss-cookies.json') ?? []
  if (!cookies.length) {
    return {
      ok: false,
      reason: 'NO_COOKIE',
      attempted: 0,
      chatStarted: 0,
      remainingToday
    }
  }

  const { initPuppeteer } = await import('@geekgeekrun/geek-auto-start-chat-with-boss/index.mjs')
  const { puppeteer } = await initPuppeteer()
  const browser = await puppeteer.launch({
    headless: false,
    ignoreHTTPSErrors: true,
    defaultViewport: { width: 1440, height: 760 }
  })

  let chatStarted = 0
  let failed = 0
  let stoppedByQuota = false

  try {
    const page = (await browser.pages())[0]
    for (const cookie of cookies) {
      if (Object.hasOwn(cookie, 'sameSite')) {
        cookie.sameSite = 'unspecified'
      }
      await page.setCookie(cookie)
    }

    for (const [index, candidate] of candidates.entries()) {
      notifyProgress({
        stage: 'start',
        index: index + 1,
        total: candidates.length,
        encryptJobId: candidate.encryptJobId
      })
      await setJobCandidateStatus({
        encryptJobId: candidate.encryptJobId,
        profileId: candidate.profileId ?? profileId,
        status: STATUS.CHATTING
      })
      try {
        const urlBeforeClick = `${DETAIL_URL_PREFIX}${candidate.encryptJobId}.html`
        await page.goto(`${DETAIL_URL_PREFIX}${candidate.encryptJobId}.html`, {
          waitUntil: 'domcontentloaded',
          timeout: 60000
        })
        await sleepWithRandomDelay(1500, 2600)

        const buttonText = await page
          .evaluate((selector) => {
            const el = document.querySelector(selector)
            return el ? (el.textContent ?? '').trim() : null
          }, CHAT_BUTTON_SELECTOR)
          .catch(() => null)

        if (buttonText !== '立即沟通') {
          await setJobCandidateStatus({
            encryptJobId: candidate.encryptJobId,
            profileId: candidate.profileId ?? profileId,
            status: STATUS.INVALID
          })
          notifyProgress({
            stage: 'skip',
            index: index + 1,
            total: candidates.length,
            reason: buttonText ? `button:${buttonText}` : 'no-button'
          })
          continue
        }

        await page.click(CHAT_BUTTON_SELECTOR)
        await sleepWithRandomDelay(2200, 3200)

        const pageText = await page.evaluate(() => document.body.innerText.slice(0, 2000))
        if (/今日.{0,6}(次数|额度).{0,6}(已用完|上限)|沟通次数已达上限/.test(pageText)) {
          stoppedByQuota = true
          await setJobCandidateStatus({
            encryptJobId: candidate.encryptJobId,
            profileId: candidate.profileId ?? profileId,
            status: STATUS.QUEUED
          })
          break
        }

        const navigatedToChat = /\/web\/geek\/chat/.test(page.url())
        const started = (await detectChatStarted(page)) ?? (navigatedToChat ? 'url' : null)
        if (!started) {
          await setJobCandidateStatus({
            encryptJobId: candidate.encryptJobId,
            profileId: candidate.profileId ?? profileId,
            status: STATUS.QUEUED
          })
          failed += 1
          notifyProgress({
            stage: 'fail',
            index: index + 1,
            total: candidates.length,
            reason: 'UNCONFIRMED'
          })
          continue
        }

        await closeChatDialog(page)
        await setJobCandidateStatus({
          encryptJobId: candidate.encryptJobId,
          profileId: candidate.profileId ?? profileId,
          status: STATUS.CHATTED
        })
        await recordCandidateChat({
          encryptJobId: candidate.encryptJobId,
          encryptCurrentUserId: candidate.encryptCurrentUserId
        })
        chatStarted += 1
        quota.count += 1
        await writeQuota(quota)
        notifyProgress({
          stage: 'done',
          index: index + 1,
          total: candidates.length,
          chatStarted
        })
        await sleepWithRandomDelay(4000, 9000)
      } catch (error) {
        failed += 1
        await setJobCandidateStatus({
          encryptJobId: candidate.encryptJobId,
          profileId: candidate.profileId ?? profileId,
          status: STATUS.QUEUED
        }).catch(() => void 0)
        notifyProgress({
          stage: 'fail',
          index: index + 1,
          total: candidates.length,
          reason: String((error as Error)?.message ?? error)
        })
      }
    }
  } finally {
    await browser.close().catch(() => void 0)
    notifyProgress({ stage: 'end', chatStarted, failed, stoppedByQuota })
  }

  return {
    ok: true,
    attempted: candidates.length,
    chatStarted,
    failed,
    stoppedByQuota,
    remainingToday: Math.max(dailyLimit - quota.count, 0)
  }
}
