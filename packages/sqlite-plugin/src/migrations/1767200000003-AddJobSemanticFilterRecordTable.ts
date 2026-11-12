import { MigrationInterface, QueryRunner } from "typeorm"

export class AddJobSemanticFilterRecordTable1767200000003 implements MigrationInterface {
  name = "AddJobSemanticFilterRecordTable1767200000003"

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "job_semantic_filter_record" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "encryptCurrentUserId" varchar NOT NULL,
        "encryptJobId" varchar NOT NULL,
        "criteriaHash" varchar NOT NULL,
        "modelId" varchar NOT NULL,
        "stage" varchar NOT NULL,
        "matchResult" integer NOT NULL,
        "confidence" float NOT NULL,
        "reasonsJson" text,
        "constraintsJson" text,
        "inputHash" varchar,
        "filteredAt" datetime NOT NULL
      )`
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_job_semantic_filter_unique" ON "job_semantic_filter_record" ("encryptCurrentUserId", "encryptJobId", "criteriaHash", "modelId", "stage")`
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_job_semantic_filter_job" ON "job_semantic_filter_record" ("encryptJobId")`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "job_semantic_filter_record"`)
  }
}
