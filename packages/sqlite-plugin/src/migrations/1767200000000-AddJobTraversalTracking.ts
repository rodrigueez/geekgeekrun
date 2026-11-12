import { MigrationInterface, QueryRunner } from "typeorm"

export class AddJobTraversalTracking1767200000000 implements MigrationInterface {
  name = "AddJobTraversalTracking1767200000000"

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "job_funnel_event" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "encryptCurrentUserId" varchar NOT NULL,
        "encryptJobId" varchar,
        "encryptBossId" varchar,
        "eventType" integer NOT NULL,
        "eventDate" datetime NOT NULL,
        "runRecordId" integer,
        "jobSource" integer,
        "sourceKey" varchar,
        "searchKeyword" varchar,
        "filterConditionKey" varchar,
        "filterConditionJson" text,
        "skipReason" varchar,
        "matchScore" integer,
        "extInfo" text
      )`
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_job_funnel_event_user_date" ON "job_funnel_event" ("encryptCurrentUserId", "eventDate")`
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_job_funnel_event_job" ON "job_funnel_event" ("encryptJobId")`
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_job_funnel_event_source_date" ON "job_funnel_event" ("sourceKey", "eventDate")`
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_job_funnel_event_filter_date" ON "job_funnel_event" ("filterConditionKey", "eventDate")`
    )

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "job_traversal_checkpoint" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "encryptCurrentUserId" varchar NOT NULL,
        "sourceKey" varchar NOT NULL,
        "filterConditionKey" varchar,
        "lastProcessedJobId" varchar,
        "updatedAt" datetime NOT NULL
      )`
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_job_traversal_checkpoint_user_source" ON "job_traversal_checkpoint" ("encryptCurrentUserId", "sourceKey")`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "job_traversal_checkpoint"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "job_funnel_event"`)
  }
}
