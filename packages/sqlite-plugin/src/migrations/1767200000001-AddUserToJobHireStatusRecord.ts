import { MigrationInterface, QueryRunner } from "typeorm"

export class AddUserToJobHireStatusRecord1767200000001 implements MigrationInterface {
  name = "AddUserToJobHireStatusRecord1767200000001"

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "job_hire_status_record" ADD COLUMN "encryptCurrentUserId" varchar`
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_job_hire_status_record_user" ON "job_hire_status_record" ("encryptCurrentUserId")`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_job_hire_status_record_user"`)
  }
}
