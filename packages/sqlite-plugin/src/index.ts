import "reflect-metadata";
import { type DataSource } from "typeorm";

import { BossInfo } from "./entity/BossInfo";
import { BossInfoChangeLog } from "./entity/BossInfoChangeLog";
import { ChatStartupFrom, ChatStartupLog } from './entity/ChatStartupLog';
import { CompanyInfoChangeLog } from "./entity/CompanyInfoChangeLog";
import { CompanyInfo } from "./entity/CompanyInfo";
import { JobInfo } from "./entity/JobInfo";
import { JobInfoChangeLog } from "./entity/JobInfoChangeLog";
import { BossActiveStatusRecord } from "./entity/BossActiveStatusRecord";
import { UserInfo } from "./entity/UserInfo";
import { AutoStartChatRunRecord } from './entity/AutoStartChatRunRecord';
import { MarkAsNotSuitLog } from "./entity/MarkAsNotSuitLog"
import { VChatStartupLog } from "./entity/VChatStartupLog";
import { VBossLibrary } from "./entity/VBossLibrary";
import { VJobLibrary } from "./entity/VJobLibrary";
import { VCompanyLibrary } from "./entity/VCompanyLibrary"
import { VMarkAsNotSuitLog } from "./entity/VMarkAsNotSuitLog"
import { ChatMessageRecord } from './entity/ChatMessageRecord'
import { LlmModelUsageRecord } from './entity/LlmModelUsageRecord'
import { JobHireStatusRecord } from './entity/JobHireStatusRecord'
import { JobFunnelEvent } from './entity/JobFunnelEvent'
import { JobTraversalCheckpoint } from './entity/JobTraversalCheckpoint'

import {
  saveChatStartupRecord,
  saveJobInfoFromRecommendPage,
  saveMarkAsNotSuitRecord,
  getNotSuitMarkRecordsInLastSomeDays,
  getChatStartupRecordsInLastSomeDays,
  getBossIdsByJobIds,
  saveJobHireStatusRecord,
  saveJobFunnelEvents,
  getRecentProcessedJobIds,
  getJobTraversalCheckpoints,
  saveJobTraversalCheckpoint
} from "./handlers";
import { UpdateChatStartupLogTable1729182577167 } from "./migrations/1729182577167-UpdateChatStartupLogTable";
import minimist from 'minimist'
import { UpdateBossInfoTable1732032381304 } from "./migrations/1732032381304-UpdateBossInfoTable";
import { JobHireStatus } from "./enums";
import { AddColumnForMarkAsNotSuitLog1746092370665 } from "./migrations/1746092370665-AddColumnForMarkAsNotSuitLog";
import { Init1000000000000 } from "./migrations/1000000000000-Init";
import { AddJobSourceColumnForChatStartupLogAndMarkAsNotSuitLog1752380078526 } from "./migrations/1752380078526-AddJobSourceColumnForChatStartupLogAndMarkAsNotSuitLog";
import { AddJobHireStatusTable1766466476822 } from "./migrations/1766466476822-AddJobHireStatusTable";
import { AddReasoningTokensToLlmModelUsageRecord1767000000000 } from "./migrations/1767000000000-AddReasoningTokensToLlmModelUsageRecord";
import { AddQueryIndexes1767100000000 } from "./migrations/1767100000000-AddQueryIndexes";
import { ScrubLlmUsageSecrets1767100000001 } from "./migrations/1767100000001-ScrubLlmUsageSecrets";
import { AddJobTraversalTracking1767200000000 } from "./migrations/1767200000000-AddJobTraversalTracking";
import { AddUserToJobHireStatusRecord1767200000001 } from "./migrations/1767200000001-AddUserToJobHireStatusRecord";
import chunk from 'lodash/chunk'
import * as typeorm from 'typeorm'

export function initDb(dbFilePath) {
  const { DataSource } = typeorm
  const appDataSource = new DataSource({
    type: "better-sqlite3",
    synchronize: false,
    logging: process.env.GEEKGEEKRUN_DB_LOGGING === '1',
    logger: "simple-console",
    database: dbFilePath,
    entities: [
      ChatStartupLog,
      BossInfo,
      BossInfoChangeLog,
      CompanyInfo,
      CompanyInfoChangeLog,
      JobInfo,
      JobInfoChangeLog,
      BossActiveStatusRecord,
      UserInfo,
      AutoStartChatRunRecord,
      VChatStartupLog,
      VBossLibrary,
      VJobLibrary,
      VCompanyLibrary,
      MarkAsNotSuitLog,
      VMarkAsNotSuitLog,
      ChatMessageRecord,
      LlmModelUsageRecord,
      JobHireStatusRecord,
      JobFunnelEvent,
      JobTraversalCheckpoint,
    ],
    migrations: [
      Init1000000000000,
      UpdateChatStartupLogTable1729182577167,
      UpdateBossInfoTable1732032381304,
      AddColumnForMarkAsNotSuitLog1746092370665,
      AddJobSourceColumnForChatStartupLogAndMarkAsNotSuitLog1752380078526,
      AddJobHireStatusTable1766466476822,
      AddReasoningTokensToLlmModelUsageRecord1767000000000,
      AddQueryIndexes1767100000000,
      ScrubLlmUsageSecrets1767100000001,
      AddJobTraversalTracking1767200000000,
      AddUserToJobHireStatusRecord1767200000001
    ],
    migrationsRun: true
  });
  return appDataSource.initialize();
}

export default class SqlitePlugin {
  initPromise: Promise<DataSource>;
  runRecordId: number;

  constructor(dbFilePath) {
    this.initPromise = initDb(dbFilePath);
    this.runRecordId = minimist(process.argv.slice(2))['run-record-id'] ?? 0
  }

  userInfo = null
  blockSets: null | {
    blockJobNotSuit: Set<string>
    blockBossNotActive: Set<string>
    blockBossNotNewChat: Set<string>
    blockJobNotHiring: Set<string>
  } = null

  async loadPersistentBlockLists(encryptUserId: string) {
    if (!this.blockSets || !encryptUserId) {
      return
    }
    const ds = await this.initPromise;
    const last7DayMarkRecords =
      (await getNotSuitMarkRecordsInLastSomeDays(ds, 7, encryptUserId)) ?? [];
    for (const record of last7DayMarkRecords) {
      if (record.encryptJobId) {
        this.blockSets.blockJobNotSuit.add(record.encryptJobId)
      }
    }

    const unavailableJobHireStatusRecords = await ds
      .getRepository(JobHireStatusRecord)
      .find({
        where: {
          hireStatus: typeorm.In([
            JobHireStatus.CLOSED,
            JobHireStatus.DELETED
          ]),
          encryptCurrentUserId: encryptUserId,
          lastSeenDate: typeorm.MoreThanOrEqual(
            new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          )
        }
      })
    for (const record of unavailableJobHireStatusRecords) {
      this.blockSets.blockJobNotHiring.add(record.encryptJobId)
    }

    const last30DayChatStartupRecords =
      (await getChatStartupRecordsInLastSomeDays(ds, 30, encryptUserId)) ?? [];
    const chattedJobIds = last30DayChatStartupRecords.map(it => it.encryptJobId)
    if (chattedJobIds.length > 0) {
      const chattedJobIdChunks = chunk(chattedJobIds, 200)
      const chattedBossIds = [];
      for (const chattedJobIdChunk of chattedJobIdChunks) {
        const chattedBossIdChunk = ((await getBossIdsByJobIds(ds, chattedJobIdChunk)) ?? []).map(it => it.encryptBossId)
        chattedBossIds.push(...chattedBossIdChunk)
      }
      for (const id of chattedBossIds) {
        this.blockSets.blockBossNotNewChat.add(id)
      }
    }
  }

  apply(hooks) {
    hooks.pageGotten.tap(
      'SqlitePlugin',
      (page) => {
        page.on('response', async (response) => {
          const ds = await this.initPromise;
          if (response.url().startsWith('https://www.zhipin.com/wapi/zpgeek/job/detail.json')) {
            const data = await response.json()
            if (data.code === 0) {
              await saveJobInfoFromRecommendPage(await ds, data.zpData)
              await saveJobHireStatusRecord(await ds, {
                encryptJobId: data.zpData.jobInfo.encryptId,
                encryptCurrentUserId: this.userInfo?.encryptUserId,
                hireStatus: JobHireStatus.HIRING,
                lastSeenDate: new Date()
              })
            }
          }
        })
      }
    )
    hooks.userInfoResponse.tapPromise(
      "SqlitePlugin",
      async ({ userInfoResponse }: { userInfoResponse?: any } = {}) => {
        if (!userInfoResponse || userInfoResponse.code !== 0) {
          return;
        }
        const { zpData: userInfo } = userInfoResponse;
        this.userInfo = userInfo

        const ds = await this.initPromise;
        const userInfoRepository = ds.getRepository(UserInfo);

        const user = new UserInfo();
        user.encryptUserId = userInfo.encryptUserId;
        user.name = userInfo.name;

        await userInfoRepository.save(user);
        await this.loadPersistentBlockLists(userInfo.encryptUserId)
        return user;
      }
    );
    hooks.mainFlowWillLaunch.tapPromise(
      "SqlitePlugin",
      async ({
        blockJobNotSuit,
        blockBossNotActive,
        blockBossNotNewChat,
        blockJobNotHiring = new Set<string>()
      }) => {
        this.blockSets = {
          blockJobNotSuit,
          blockBossNotActive,
          blockBossNotNewChat,
          blockJobNotHiring
        }
      }
    );

    hooks.jobDetailIsGetFromRecommendList.tapPromise("SqlitePlugin", async (_jobInfo) => {
      const ds = await this.initPromise;
      await saveJobInfoFromRecommendPage(ds, _jobInfo);
    });

    hooks.jobDetailIsGetFromRecommendList.tapPromise("SqlitePlugin", async ({ jobInfo }) => {
      const ds = await this.initPromise;
      return await saveJobHireStatusRecord(ds, {
        encryptJobId: jobInfo.encryptId,
        encryptCurrentUserId: this.userInfo?.encryptUserId,
        hireStatus: JobHireStatus.HIRING,
        lastSeenDate: new Date()
      });
    });

    hooks.newChatStartup.tapPromise("SqlitePlugin", async (_jobInfo, { chatStartupFrom = ChatStartupFrom.AutoFromRecommendList, jobSource = undefined } = {}) => {
      const ds = await this.initPromise;
      return await saveChatStartupRecord(ds, _jobInfo, this.userInfo, {
        autoStartupChatRecordId: this.runRecordId,
        chatStartupFrom,
        jobSource
      });
    });

    hooks.jobMarkedAsNotSuit.tapPromise("SqlitePlugin", async (_jobInfo, { markFrom = ChatStartupFrom.AutoFromRecommendList, markReason = undefined, extInfo = undefined, markOp = undefined, jobSource = undefined } = {}) => {
      const ds = await this.initPromise;
      return await saveMarkAsNotSuitRecord(ds, _jobInfo, this.userInfo, {
        autoStartupChatRecordId: this.runRecordId,
        markFrom,
        markReason,
        extInfo,
        markOp,
        jobSource
      });
    });

    hooks.jobTraversalStateLoaded?.tapPromise(
      "SqlitePlugin",
      async (encryptUserId, context) => {
        if (!encryptUserId || !context) {
          return;
        }
        const ds = await this.initPromise;
        context.checkpoints = await getJobTraversalCheckpoints(ds, encryptUserId) ?? [];
        context.processedJobIds = new Set(
          await getRecentProcessedJobIds(ds, encryptUserId, 7) ?? []
        );
      }
    );

    hooks.jobFunnelEvents?.tapPromise("SqlitePlugin", async (events) => {
      const ds = await this.initPromise;
      return saveJobFunnelEvents(ds, events);
    });

    hooks.jobTraversalCheckpointSaved?.tapPromise("SqlitePlugin", async (payload) => {
      const ds = await this.initPromise;
      return saveJobTraversalCheckpoint(ds, payload);
    });
  }
}
