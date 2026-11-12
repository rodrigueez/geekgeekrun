import { MigrationInterface, QueryRunner } from "typeorm"

export class AddQueryIndexes1767100000000 implements MigrationInterface {
  name = "AddQueryIndexes1767100000000"

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_chat_startup_log_job_id" ON "chat_startup_log" ("encryptJobId")`
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_chat_startup_log_date" ON "chat_startup_log" ("date")`
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_chat_startup_log_user_date" ON "chat_startup_log" ("encryptCurrentUserId", "date")`
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_mark_as_not_suit_log_job_id" ON "mark_as_not_suit_log" ("encryptJobId")`
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_mark_as_not_suit_log_date" ON "mark_as_not_suit_log" ("date")`
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_mark_as_not_suit_log_user_date" ON "mark_as_not_suit_log" ("encryptCurrentUserId", "date")`
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_job_info_change_log_job_id" ON "job_info_change_log" ("encryptJobId")`
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_job_info_change_log_update_time" ON "job_info_change_log" ("updateTime")`
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_job_hire_status_record_status" ON "job_hire_status_record" ("hireStatus")`
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_job_hire_status_record_last_seen" ON "job_hire_status_record" ("lastSeenDate")`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_startup_log_job_id"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_startup_log_date"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_startup_log_user_date"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_mark_as_not_suit_log_job_id"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_mark_as_not_suit_log_date"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_mark_as_not_suit_log_user_date"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_job_info_change_log_job_id"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_job_info_change_log_update_time"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_job_hire_status_record_status"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_job_hire_status_record_last_seen"`)
  }
}
