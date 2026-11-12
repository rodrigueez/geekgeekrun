import 'reflect-metadata'
import { parentPort } from 'node:worker_threads'
import { initDb } from '@geekgeekrun/sqlite-plugin'
import { type DataSource } from 'typeorm'
import { getPublicDbFilePath } from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { VChatStartupLog } from '@geekgeekrun/sqlite-plugin/dist/entity/VChatStartupLog'
import { VJobLibrary } from '@geekgeekrun/sqlite-plugin/dist/entity/VJobLibrary'
import { VCompanyLibrary } from '@geekgeekrun/sqlite-plugin/dist/entity/VCompanyLibrary'
import { VBossLibrary } from '@geekgeekrun/sqlite-plugin/dist/entity/VBossLibrary'
import { VMarkAsNotSuitLog } from '@geekgeekrun/sqlite-plugin/dist/entity/VMarkAsNotSuitLog'
import { measureExecutionTime } from '../../../../../../common/utils/performance'
import { PageReq, PagedRes } from '../../../../../../common/types/pagination'
import { JobInfoChangeLog } from '@geekgeekrun/sqlite-plugin/dist/entity/JobInfoChangeLog'
import { AutoStartChatRunRecord } from '@geekgeekrun/sqlite-plugin/dist/entity/AutoStartChatRunRecord'
import { JobCandidate } from '@geekgeekrun/sqlite-plugin/dist/entity/JobCandidate'
import { ChatStartupLog, ChatStartupFrom } from '@geekgeekrun/sqlite-plugin/dist/entity/ChatStartupLog'
import { JobCandidateStatus } from '@geekgeekrun/sqlite-plugin/dist/enums'
import { In } from 'typeorm'

const dbInitPromise = initDb(getPublicDbFilePath())
let dataSource: DataSource | null = null

dbInitPromise.then(
  (_dataSource) => {
    dataSource = _dataSource
    attachMessageHandler()
    parentPort?.postMessage({
      type: 'DB_INIT_SUCCESS'
    })
  },
  (error) => {
    parentPort?.postMessage({
      type: 'DB_INIT_FAIL',
      error
    })
    process.exit(1)
  }
)

const payloadHandler = {
  async getAutoStartChatRecord({ pageNo, pageSize }: Partial<PageReq> = {}): Promise<
    PagedRes<VChatStartupLog>
  > {
    if (!pageNo) {
      pageNo = 1
    }
    if (!pageSize) {
      pageSize = 10
    }

    const userRepository = dataSource!.getRepository(VChatStartupLog)!
    const [data, totalItemCount] = await measureExecutionTime(
      userRepository.findAndCount({
        skip: (pageNo - 1) * pageSize,
        take: pageSize,
        order: {
          date: 'DESC'
        }
      })
    )
    return {
      data,
      pageNo,
      totalItemCount
    }
  },
  async getMarkAsNotSuitRecord({ pageNo, pageSize }: Partial<PageReq> = {}): Promise<
    PagedRes<VMarkAsNotSuitLog>
  > {
    if (!pageNo) {
      pageNo = 1
    }
    if (!pageSize) {
      pageSize = 10
    }
    const recordRepository = dataSource!.getRepository(VMarkAsNotSuitLog)!
    const [data, totalItemCount] = await measureExecutionTime(
      recordRepository.findAndCount({
        skip: (pageNo - 1) * pageSize,
        take: pageSize,
        order: {
          date: 'DESC'
        }
      })
    )
    return {
      data,
      pageNo,
      totalItemCount
    }
  },
  async getJobLibrary({ pageNo, pageSize }: Partial<PageReq> = {}): Promise<PagedRes<VJobLibrary>> {
    if (!pageNo) {
      pageNo = 1
    }
    if (!pageSize) {
      pageSize = 10
    }

    const userRepository = dataSource!.getRepository(VJobLibrary)!
    const [data, totalItemCount] = await measureExecutionTime(
      userRepository.findAndCount({
        skip: (pageNo - 1) * pageSize,
        take: pageSize
      })
    )
    return {
      data,
      pageNo,
      totalItemCount
    }
  },
  async getCompanyLibrary({ pageNo, pageSize }: Partial<PageReq> = {}): Promise<
    PagedRes<VCompanyLibrary>
  > {
    if (!pageNo) {
      pageNo = 1
    }
    if (!pageSize) {
      pageSize = 10
    }

    const userRepository = dataSource!.getRepository(VCompanyLibrary)!
    const [data, totalItemCount] = await measureExecutionTime(
      userRepository.findAndCount({
        skip: (pageNo - 1) * pageSize,
        take: pageSize
      })
    )
    return {
      data,
      pageNo,
      totalItemCount
    }
  },
  async getBossLibrary({ pageNo, pageSize }: Partial<PageReq> = {}): Promise<
    PagedRes<VBossLibrary>
  > {
    if (!pageNo) {
      pageNo = 1
    }
    if (!pageSize) {
      pageSize = 10
    }

    const userRepository = dataSource!.getRepository(VBossLibrary)!
    const [data, totalItemCount] = await measureExecutionTime(
      userRepository.findAndCount({
        skip: (pageNo - 1) * pageSize,
        take: pageSize
      })
    )
    return {
      data,
      pageNo,
      totalItemCount
    }
  },
  async getJobHistoryByEncryptId({ encryptJobId }): Promise<JobInfoChangeLog[]> {
    const jobInfoChangeLogRepository = dataSource!.getRepository(JobInfoChangeLog)!
    const data = await measureExecutionTime(
      jobInfoChangeLogRepository.find({
        where: {
          encryptJobId
        }
      })
    )
    return data
  },
  async saveAndGetCurrentRunRecord() {
    const autoStartChatRunRecord = new AutoStartChatRunRecord()
    autoStartChatRunRecord.date = new Date()
    const autoStartChatRunRecordRepository = dataSource!.getRepository(AutoStartChatRunRecord)
    const result = await autoStartChatRunRecordRepository.save(autoStartChatRunRecord)
    return result
  },
  async getJobCandidateList({
    pageNo = 1,
    pageSize = 20,
    statusList = [],
    profileId = ''
  }: {
    pageNo?: number
    pageSize?: number
    statusList?: JobCandidateStatus[]
    profileId?: string
  } = {}): Promise<PagedRes<JobCandidate>> {
    const repository = dataSource!.getRepository(JobCandidate)
    const where: Record<string, unknown> = {}
    if (profileId) {
      where.profileId = profileId
    }
    if (statusList?.length) {
      where.status = In(statusList)
    }
    const [data, totalItemCount] = await repository.findAndCount({
      where,
      order: {
        matchScore: 'DESC',
        collectedAt: 'DESC'
      },
      skip: (Math.max(pageNo, 1) - 1) * pageSize,
      take: pageSize
    })
    return {
      data,
      pageNo,
      totalItemCount
    }
  },
  async getJobCandidatesByStatus({
    statusList = [],
    profileId = '',
    limit = 50
  }: {
    statusList?: JobCandidateStatus[]
    profileId?: string
    limit?: number
  } = {}): Promise<JobCandidate[]> {
    const repository = dataSource!.getRepository(JobCandidate)
    const where: Record<string, unknown> = {}
    if (profileId) {
      where.profileId = profileId
    }
    if (statusList?.length) {
      where.status = In(statusList)
    }
    return await repository.find({
      where,
      order: {
        matchScore: 'DESC',
        collectedAt: 'DESC'
      },
      take: Math.min(Math.max(limit, 1), 200)
    })
  },
  async setJobCandidateStatus({
    encryptJobId,
    profileId = '',
    status
  }: {
    encryptJobId: string
    profileId?: string
    status: JobCandidateStatus
  }) {
    const repository = dataSource!.getRepository(JobCandidate)
    const existing = await repository.findOne({
      where: {
        encryptJobId,
        profileId
      }
    })
    if (!existing) {
      return null
    }
    existing.status = status
    existing.statusUpdatedAt = new Date()
    if (status === JobCandidateStatus.CHATTING && !existing.chatStartedAt) {
      existing.chatStartedAt = new Date()
    }
    await repository.save(existing)
    return existing
  },
  async recordCandidateChat({
    encryptJobId,
    encryptCurrentUserId
  }: {
    encryptJobId: string
    encryptCurrentUserId: string
  }) {
    if (!encryptJobId || !encryptCurrentUserId) {
      return null
    }
    const repository = dataSource!.getRepository(ChatStartupLog)
    const record = new ChatStartupLog()
    record.encryptJobId = encryptJobId
    record.encryptCurrentUserId = encryptCurrentUserId
    record.date = new Date()
    record.chatStartupFrom = ChatStartupFrom.ManuallyFromRecommendList
    return await repository.save(record)
  }
}

async function attachMessageHandler() {
  parentPort?.on('message', async (event) => {
    const { _uuid, ...restObj } = event
    const { type } = event

    if (!dataSource) {
      await dbInitPromise
    }
    const result = await payloadHandler[type](restObj)
    parentPort?.postMessage({
      _uuid,
      data: result
    })
  })
}
