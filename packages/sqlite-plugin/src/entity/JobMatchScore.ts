import { JobMatchScorerType } from "../enums";
import * as typeorm from 'typeorm';
const { Entity, Column, PrimaryGeneratedColumn, Index } = typeorm

@Entity()
@Index(
  ["encryptCurrentUserId", "encryptJobId", "resumeHash", "modelId", "scorerType", "inputHash"],
  { unique: true }
)
export class JobMatchScore {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  encryptCurrentUserId: string;

  @Column()
  encryptJobId: string;

  @Column()
  resumeHash: string;

  @Column()
  modelId: string;

  @Column()
  scorerType: JobMatchScorerType;

  @Column()
  score: number;

  @Column({
    nullable: true
  })
  reasonsJson?: string;

  @Column({
    nullable: true
  })
  inputHash?: string;

  @Column()
  scoredAt: Date;
}
