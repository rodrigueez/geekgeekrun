import { sendToDaemon } from '../flow/OPEN_SETTING_WINDOW/connect-to-daemon'
import minimist from 'minimist'
import { loginWithCookieAssistant } from './login-with-cookie-assistant'
import { checkCookieListFormat } from '../../common/utils/cookie'
import { sleep } from '@geekgeekrun/utils/sleep.mjs'
import {
  readStorageFile,
  writeStorageFile
} from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'

const runRecordId = minimist(process.argv.slice(2))['run-record-id'] ?? null

const VOLATILE_COOKIE_NAMES = ['__zp_stoken__']
const SESSION_PROBE_URL = 'https://www.zhipin.com/web/geek/jobs'

async function fetchUserInfo(page) {
  return await page.evaluate(async () => {
    const response = await fetch('/wapi/zpuser/wap/getUserInfo.json', {
      credentials: 'include',
      headers: {
        accept: 'application/json, text/plain, */*'
      }
    })
    return await response.json()
  })
}

async function persistCurrentStorage(page) {
  try {
    const [cookies, localStorage] = await Promise.all([
      page.cookies(),
      page
        .evaluate(() => JSON.stringify(window.localStorage))
        .then((text) => JSON.parse(text))
    ])
    await Promise.all([
      writeStorageFile('boss-cookies.json', cookies),
      writeStorageFile('boss-local-storage.json', localStorage)
    ])
  } catch (err) {
    console.log('persist storage failed', err)
  }
}

async function refreshSessionWithExistingCookies(browser) {
  if (!browser) {
    return null
  }
  try {
    const pages = await browser.pages()
    const page =
      pages.find((item) => item.url().startsWith('https://www.zhipin.com')) ?? pages[0]
    if (!page) {
      return null
    }
    const cookies = await page.cookies('https://www.zhipin.com')
    if (!cookies.length) {
      return null
    }
    for (const name of VOLATILE_COOKIE_NAMES) {
      if (cookies.some((cookie) => cookie.name === name)) {
        await page.deleteCookie({ name, url: 'https://www.zhipin.com' })
      }
    }
    await page.goto(SESSION_PROBE_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 45000
    })
    for (let attempt = 0; attempt < 3; attempt++) {
      await sleep(attempt === 0 ? 1500 : 2000)
      const userInfo = await fetchUserInfo(page)
      if (userInfo?.code === 0) {
        await persistCurrentStorage(page)
        return userInfo
      }
    }
    return null
  } catch (err) {
    console.log('refresh session with existing cookies failed', err)
    return null
  }
}

export class CookieInvalidHandlePlugin {
  apply(hooks) {
    hooks.cookieWillSet.tapPromise('CookieInvalidHandlePlugin', async ({ cookies, browser } = {}) => {
      let isValid = checkCookieListFormat(cookies)
      while (!isValid) {
        try {
          browser && (await browser.close())
        } catch (err) {
          console.log(`close browser failed`, err)
        }
        try {
          // popup login dialog, then update login status
          let app
          try {
            app = (await import('electron')).app
          } catch {
            //
          }
          // popup login dialog, then update login status
          try {
            await app?.dock?.show()
            await loginWithCookieAssistant()
          } finally {
            await app?.dock?.hide()
          }
          await sleep(2000)
          const newCookies = readStorageFile('boss-cookies.json')
          isValid = checkCookieListFormat(newCookies)
          if (isValid) {
            cookies.length = 0
            for (const cookie of newCookies) {
              cookies.push(cookie)
            }
          }
        } catch (e) {
          if (e?.message === 'USER_CANCELLED_LOGIN') {
            sendToDaemon({
              type: 'worker-to-gui-message',
              workerId: process.env.GEEKGEEKRUND_WORKER_ID,
              data: {
                type: 'prerequisite-step-by-step-check',
                step: {
                  id: 'basic-cookie-check',
                  status: 'rejected'
                },
                runRecordId
              }
            })
            throw new Error('LOGIN_STATUS_INVALID')
          }
        }
      }
      sendToDaemon({
        type: 'worker-to-gui-message',
        workerId: process.env.GEEKGEEKRUND_WORKER_ID,
        data: {
          type: 'prerequisite-step-by-step-check',
          step: {
            id: 'basic-cookie-check',
            status: 'fulfilled'
          },
          runRecordId
        }
      })
    })
    hooks.userInfoResponse.tapPromise('CookieInvalidHandlePlugin', async ({ userInfoResponse, browser } = {}) => {
      if (userInfoResponse.code === 0) {
        sendToDaemon({
          type: 'worker-to-gui-message',
          workerId: process.env.GEEKGEEKRUND_WORKER_ID,
          data: {
            type: 'prerequisite-step-by-step-check',
            step: {
              id: 'login-status-check',
              status: 'fulfilled'
            },
            runRecordId
          }
        })
        return
      }
      const refreshedUserInfo = await refreshSessionWithExistingCookies(browser)
      if (refreshedUserInfo?.code === 0) {
        Object.assign(userInfoResponse, refreshedUserInfo)
        sendToDaemon({
          type: 'worker-to-gui-message',
          workerId: process.env.GEEKGEEKRUND_WORKER_ID,
          data: {
            type: 'prerequisite-step-by-step-check',
            step: {
              id: 'login-status-check',
              status: 'fulfilled'
            },
            runRecordId
          }
        })
        return
      }
      try {
        browser && (await browser.close())
      } catch (err) {
        console.log(`close browser failed`, err)
      }
      await writeStorageFile('boss-cookies.json', [])
      try {
        // popup login dialog, then update login status
        let app
        try {
          app = (await import('electron')).app
        } catch {
          //
        }
        // popup login dialog, then update login status
        try {
          await app?.dock?.show()
          await loginWithCookieAssistant()
        } finally {
          await app?.dock?.hide()
        }
      } catch (e) {
        if (e?.message === 'USER_CANCELLED_LOGIN') {
          sendToDaemon({
            type: 'worker-to-gui-message',
            workerId: process.env.GEEKGEEKRUND_WORKER_ID,
            data: {
              type: 'prerequisite-step-by-step-check',
              step: {
                id: 'login-status-check',
                status: 'rejected'
              },
              runRecordId
            }
          })
          throw new Error('LOGIN_STATUS_INVALID')
        }
      }
      // throw new Error('THROW_FOR_RETRY')
      return Promise.reject(new Error('THROW_FOR_RETRY'))
    })
  }
}
