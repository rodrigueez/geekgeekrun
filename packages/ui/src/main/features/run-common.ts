import { AUTO_CHAT_ERROR_EXIT_CODE } from '../../common/enums/auto-start-chat'
import { daemonEE, sendToDaemon } from '../flow/OPEN_SETTING_WINDOW/connect-to-daemon'
import { saveAndGetCurrentRunRecord } from '../flow/OPEN_SETTING_WINDOW/utils/db'
import minimist from 'minimist'

export async function runCommon({ mode }) {
  await sendToDaemon(
    {
      type: 'user-process-register'
    },
    {
      needCallback: true
    }
  )
  const daemonStatus = (await sendToDaemon(
    {
      type: 'get-status'
    },
    {
      needCallback: true
    }
  )) as { workers?: Array<{ workerId: string; args?: string }> } | undefined
  const taskList = daemonStatus?.workers
  const runningTask = taskList?.find((it) => it.workerId === mode)
  if (runningTask) {
    const commandlineArgs = minimist(runningTask.args ?? [])
    const runRecordId = Number(commandlineArgs['run-record-id'])
    console.log('任务已在运行中')
    return {
      runRecordId,
      isAlreadyRunning: true
    }
  }
  const currentRunRecord = (
    (await saveAndGetCurrentRunRecord()) as { data?: { id?: number } }
  )?.data
  const subProcessEnv = {
    ...process.env,
    GEEKGEEKRUND_NO_AUTO_RESTART_EXIT_CODE: [
      AUTO_CHAT_ERROR_EXIT_CODE.PUPPETEER_IS_NOT_EXECUTABLE,
      AUTO_CHAT_ERROR_EXIT_CODE.LOGIN_STATUS_INVALID,
      AUTO_CHAT_ERROR_EXIT_CODE.LLM_UNAVAILABLE
    ].join(',')
  }
  const args =
    process.env.NODE_ENV === 'development'
      ? [process.argv[1], `--mode=${mode}`, `--run-record-id=${currentRunRecord?.id || 0}`]
      : [`--mode=${mode}`, `--run-record-id=${currentRunRecord?.id || 0}`]
  await sendToDaemon(
    {
      type: 'start-worker',
      workerId: mode,
      command: process.argv[0],
      args,
      env: subProcessEnv
    },
    {
      needCallback: true
    }
  )
  const workerExitedHandler = (message) => {
    if (message.workerId === mode && message.type === 'worker-exited') {
      if (!message.restarting) {
        daemonEE.off('message', workerExitedHandler)
        if (globalThis.GEEKGEEKRUN_PROCESS_ROLE !== 'ui') {
          process.exit(0)
        }
      }
    }
  }
  daemonEE.on('message', workerExitedHandler)
  return {
    runRecordId: currentRunRecord?.id
  }
}
