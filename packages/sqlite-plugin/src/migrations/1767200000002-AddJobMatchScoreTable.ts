import { MigrationInterface, QueryRunner } from "typeorm"

export class AddJobMatchScoreTable1767200000002 implements MigrationInterface {
  name = "AddJobMatchScoreTable1767200000002"

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "job_match_score" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "encryptCurrentUserId" varchar NOT NULL,
        "encryptJobId" varchar NOT NULL,
        "resumeHash" varchar NOT NULL,
        "modelId" varchar NOT NULL,
        "scorerType" integer NOT NULL,
        "score" integer NOT NULL,
        "reasonsJson" text,
        "inputHash" varchar,
        "scoredAt" datetime NOT NULL
      )`
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_job_match_score_unique" ON "job_match_score" ("encryptCurrentUserId", "encryptJobId", "resumeHash", "modelId", "scorerType")`
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_job_match_score_job" ON "job_match_score" ("encryptJobId")`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "job_match_score"`)
  }
}
