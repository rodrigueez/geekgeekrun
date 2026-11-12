import * as typeorm from 'typeorm';
const { Entity, Column, PrimaryGeneratedColumn, Index } = typeorm

@Entity()
@Index(
  ["encryptCurrentUserId", "encryptJobId", "criteriaHash", "modelId", "stage"],
  { unique: true }
)
export class JobSemanticFilterRecord {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  encryptCurrentUserId: string;

  @Column()
  encryptJobId: string;

  @Column()
  criteriaHash: string;

  @Column()
  modelId: string;

  @Column()
  stage: string;

  @Column()
  matchResult: number;

  @Column()
  confidence: number;

  @Column({
    nullable: true
  })
  reasonsJson?: string;

  @Column({
    nullable: true
  })
  constraintsJson?: string;

  @Column({
    nullable: true
  })
  inputHash?: string;

  @Column()
  filteredAt: Date;
}
