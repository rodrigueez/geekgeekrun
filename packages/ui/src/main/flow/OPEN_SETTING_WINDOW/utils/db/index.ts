import createDbWorker from './worker/index?nodeWorker&url'
import { type Worker } from 'node:worker_threads'
import { randomUUID } from 'node:crypto'
import { PageReq } from '../../../../../common/types/pagination'

let worker: Worker | null = null
let workerExitCode: number | null = null
const pendingRequestRejectors = new Set<(err: Error) => void>()

const rejectPendingRequests = (err: Error) => {
  for (const reject of pendingRequestRejectors) {
    reject(err)
  }
  pendingRequestRejectors.clear()
}

const markWorkerFailed = (err: Error) => {
  workerExitCode = -1
  worker = null
  rejectPendingRequests(err)
}

export const initDbWorker = () => {
  if (!worker || typeof workerExitCode === 'number') {
    const nextWorker = createDbWorker()
    worker = nextWorker
    workerExitCode = null
    return new Promise((resolve, reject) => {
      nextWorker.once('error', (error) => {
        const err = error instanceof Error ? error : new Error(String(error))
        markWorkerFailed(err)
        reject(err)
      })
      nextWorker.once('exit', (exitCode) => {
        workerExitCode = exitCode
        if (worker === nextWorker) {
          worker = null
        }
        rejectPendingRequests(new Error(`数据库进程已退出（code ${exitCode}）`))
      })
      nextWorker.on('message', function handler(data) {
        if (data.type === 'DB_INIT_SUCCESS') {
          resolve(nextWorker)
          // attach more event
          nextWorker.off('message', handler)
        } else if (data.type === 'DB_INIT_FAIL') {
          reject(data.error)
          nextWorker.terminate()
          nextWorker.off('message', handler)
          if (worker === nextWorker) {
            worker = null
          }
        }
      })
    })
  } else {
    return worker
  }
}

const createWorkerPromise = async (data) => {
  await initDbWorker()
  const targetWorker = worker
  if (!targetWorker) {
    throw new Error('数据库进程不可用')
  }
  const uuid = randomUUID()
  targetWorker.postMessage({
    _uuid: uuid,
    ...data
  })
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      targetWorker.off('message', handler)
      pendingRequestRejectors.delete(rejectRequest)
    }
    const rejectRequest = (err: Error) => {
      cleanup()
      reject(err)
    }
    function handler(data) {
      const { _uuid, ...payload } = data ?? {}
      if (_uuid === uuid) {
        cleanup()
        resolve(payload)
      }
    }
    pendingRequestRejectors.add(rejectRequest)
    targetWorker.on('message', handler)
  })
}

export const getAutoStartChatRecord = async ({ pageNo, pageSize }: Partial<PageReq> = {}) => {
  const res = await createWorkerPromise({
    type: 'getAutoStartChatRecord',
    pageNo,
    pageSize
  })
  return res
}

export const getMarkAsNotSuitRecord = async ({ pageNo, pageSize }: Partial<PageReq> = {}) => {
  const res = await createWorkerPromise({
    type: 'getMarkAsNotSuitRecord',
    pageNo,
    pageSize
  })
  return res
}

export const getBossLibrary = async ({ pageNo, pageSize }: Partial<PageReq> = {}) => {
  const res = await createWorkerPromise({
    type: 'getBossLibrary',
    pageNo,
    pageSize
  })
  return res
}

export const getCompanyLibrary = async ({ pageNo, pageSize }: Partial<PageReq> = {}) => {
  const res = await createWorkerPromise({
    type: 'getCompanyLibrary',
    pageNo,
    pageSize
  })
  return res
}

export const getJobLibrary = async ({ pageNo, pageSize }: Partial<PageReq> = {}) => {
  const res = await createWorkerPromise({
    type: 'getJobLibrary',
    pageNo,
    pageSize
  })
  return res
}

export const getJobHistoryByEncryptId = async (encryptJobId) => {
  const res = await createWorkerPromise({
    type: 'getJobHistoryByEncryptId',
    encryptJobId
  })
  return res
}

export const saveAndGetCurrentRunRecord = async () => {
  const res = await createWorkerPromise({
    type: 'saveAndGetCurrentRunRecord'
  })
  return res
}

export const getJobCandidateList = async ({
  pageNo,
  pageSize,
  statusList,
  profileId
}: {
  pageNo?: number
  pageSize?: number
  statusList?: number[]
  profileId?: string
} = {}) => {
  return await createWorkerPromise({
    type: 'getJobCandidateList',
    pageNo,
    pageSize,
    statusList,
    profileId
  })
}

export const getJobCandidatesByStatus = async ({
  statusList,
  profileId,
  limit
}: {
  statusList?: number[]
  profileId?: string
  limit?: number
} = {}) => {
  return await createWorkerPromise({
    type: 'getJobCandidatesByStatus',
    statusList,
    profileId,
    limit
  })
}

export const setJobCandidateStatus = async ({
  encryptJobId,
  profileId,
  status
}: {
  encryptJobId: string
  profileId?: string
  status: number
}) => {
  return await createWorkerPromise({
    type: 'setJobCandidateStatus',
    encryptJobId,
    profileId,
    status
  })
}

export const recordCandidateChat = async ({
  encryptJobId,
  encryptCurrentUserId
}: {
  encryptJobId: string
  encryptCurrentUserId: string
}) => {
  return await createWorkerPromise({
    type: 'recordCandidateChat',
    encryptJobId,
    encryptCurrentUserId
  })
}
