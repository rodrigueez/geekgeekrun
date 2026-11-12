import { MigrationInterface, QueryRunner } from "typeorm"

export class AddJobCandidateTable1767300000000 implements MigrationInterface {
  name = "AddJobCandidateTable1767300000000"

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "job_candidate" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "encryptCurrentUserId" varchar NOT NULL,
        "encryptJobId" varchar NOT NULL,
        "profileId" varchar NOT NULL DEFAULT '',
        "status" integer NOT NULL,
        "matchScore" integer,
        "reasonJson" text,
        "jobSnapshotJson" text,
        "sourceKey" varchar,
        "searchKeyword" varchar,
        "filterConditionKey" varchar,
        "collectedAt" datetime NOT NULL,
        "statusUpdatedAt" datetime NOT NULL,
        "chatStartedAt" datetime
      )`
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_job_candidate_unique" ON "job_candidate" ("encryptCurrentUserId", "encryptJobId", "profileId")`
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_job_candidate_status" ON "job_candidate" ("encryptCurrentUserId", "profileId", "status")`
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_job_candidate_job" ON "job_candidate" ("encryptJobId")`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "job_candidate"`)
  }
}
