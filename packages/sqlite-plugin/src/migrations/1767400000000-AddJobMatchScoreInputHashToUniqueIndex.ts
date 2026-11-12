import { MigrationInterface, QueryRunner } from "typeorm"

export class AddJobMatchScoreInputHashToUniqueIndex1767400000000 implements MigrationInterface {
  name = "AddJobMatchScoreInputHashToUniqueIndex1767400000000"

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_job_match_score_unique"`)
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_job_match_score_unique" ON "job_match_score" ("encryptCurrentUserId", "encryptJobId", "resumeHash", "modelId", "scorerType", "inputHash")`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_job_match_score_unique"`)
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_job_match_score_unique" ON "job_match_score" ("encryptCurrentUserId", "encryptJobId", "resumeHash", "modelId", "scorerType")`
    )
  }
}
