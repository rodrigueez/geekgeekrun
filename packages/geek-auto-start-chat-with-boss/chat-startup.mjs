import { sleep, sleepWithRandomDelay } from '@geekgeekrun/utils/sleep.mjs'

export async function handleChatAddFriendResponse({
  page,
  targetJobData,
  waitForSageTime,
  onChatSuccess,
  onStoreStorage
}) {
  const waitAddFriendResponse = async () => {
    const addFriendResponse = await page.waitForResponse((response) => {
      return (
        response.url().startsWith('https://www.zhipin.com/wapi/zpgeek/friend/add.json') &&
        response.url().includes(`jobId=${targetJobData.jobInfo.encryptId}`)
      )
    })
    await sleepWithRandomDelay(3000)
    try {
      return await addFriendResponse.json()
    } catch (err) {
      await sleep(2000)
      if (page.url().startsWith('https://www.zhipin.com/web/geek/chat')) {
        throw new Error('PAGE_JUMPED_TO_CHAT_PAGE')
      }
      throw err
    }
  }

  const handleAddFriendResponse = async (
    res,
    { hasGoToChatPage = false } = {}
  ) => {
    if (res.code === 0) {
      await onChatSuccess({ hasGoToChatPage })
    } else if (
      res.zpData.bizCode === 1 &&
      res.zpData.bizData?.chatRemindDialog?.blockLevel === 0 &&
      /剩\d+次沟通机会/.test(res.zpData.bizData?.chatRemindDialog?.content)
    ) {
      await waitForSageTime({
        tag: 'beforeJobChatStartupAfterTwiceConfirm'
      })
      const confirmButton = await page.waitForSelector(
        '.chat-block-dialog .chat-block-footer .sure-btn'
      )
      await confirmButton.click()
      await handleAddFriendResponse(await waitAddFriendResponse())
    } else if (
      res.zpData.bizCode === 1 &&
      /猎头/.test(res.zpData.bizData?.chatRemindDialog?.content)
    ) {
      await waitForSageTime({
        tag: 'beforeJobChatStartupAfterTwiceConfirm'
      })
      const confirmButton = await page.waitForSelector(
        'xpath///*[contains(@class, "chat-block-dialog")]//*[contains(@class, "chat-block-footer")]//*[contains(text(), "继续")]'
      )
      await confirmButton.click()
      await handleAddFriendResponse(await waitAddFriendResponse())
    } else if (
      res.zpData.bizCode === 1 &&
      res.zpData.bizData?.chatRemindDialog?.blockLevel === 0 &&
      (
        res.zpData.bizData?.chatRemindDialog?.content ===
          '今日沟通人数已达上限，请明天再试' ||
        /明天再来/.test(res.zpData.bizData?.chatRemindDialog?.content)
      )
    ) {
      await onStoreStorage?.()
      throw new Error(
        'STARTUP_CHAT_ERROR_DUE_TO_TODAY_CHANCE_HAS_USED_OUT'
      )
    } else {
      console.error(JSON.stringify(res, null, 2))
      throw new Error('STARTUP_CHAT_ERROR_WITH_UNKNOWN_ERROR')
    }
  }

  try {
    await handleAddFriendResponse(await waitAddFriendResponse())
  } catch (err) {
    if (
      err instanceof Error &&
      err.message === 'PAGE_JUMPED_TO_CHAT_PAGE'
    ) {
      await handleAddFriendResponse(
        {
          code: 0
        },
        { hasGoToChatPage: true }
      )
      return
    }
    throw err
  }
}
