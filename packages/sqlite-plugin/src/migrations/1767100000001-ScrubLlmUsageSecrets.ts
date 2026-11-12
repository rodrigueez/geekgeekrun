import { createHash } from "node:crypto"
import { MigrationInterface, QueryRunner } from "typeorm"

export class ScrubLlmUsageSecrets1767100000001 implements MigrationInterface {
  name = "ScrubLlmUsageSecrets1767100000001"

  public async up(queryRunner: QueryRunner): Promise<void> {
    const records = await queryRunner.query(
      `SELECT "id", "providerApiSecret" FROM "llm_model_usage_record" WHERE "providerApiSecret" IS NOT NULL AND "providerApiSecret" <> ''`
    )
    for (const record of records) {
      const secretHash = createHash("sha256")
        .update(String(record.providerApiSecret))
        .digest("hex")
        .slice(0, 16)
      await queryRunner.query(
        `UPDATE "llm_model_usage_record" SET "providerApiSecret" = ? WHERE "id" = ?`,
        [secretHash, record.id]
      )
    }
  }

  public async down(): Promise<void> {
    // The original secrets are intentionally not recoverable.
  }
}
