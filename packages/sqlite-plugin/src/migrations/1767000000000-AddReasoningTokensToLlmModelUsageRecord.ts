import { MigrationInterface, QueryRunner } from "typeorm"

export class AddReasoningTokensToLlmModelUsageRecord1767000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "llm_model_usage_record" ADD COLUMN "reasoningTokens" integer;`
    )
  }

  public async down(): Promise<void> {}
}
