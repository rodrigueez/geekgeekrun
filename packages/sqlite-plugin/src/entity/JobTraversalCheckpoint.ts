import * as typeorm from 'typeorm';
const { Entity, Column, PrimaryGeneratedColumn, Index } = typeorm

@Entity()
@Index(["encryptCurrentUserId", "sourceKey"], { unique: true })
export class JobTraversalCheckpoint {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  encryptCurrentUserId: string;

  @Column()
  sourceKey: string;

  @Column({
    nullable: true
  })
  filterConditionKey?: string;

  @Column({
    nullable: true
  })
  lastProcessedJobId?: string;

  @Column()
  updatedAt: Date;
}
