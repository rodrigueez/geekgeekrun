import { JobCandidateStatus } from "../enums";
import * as typeorm from 'typeorm';
const { Entity, Column, PrimaryGeneratedColumn, Index } = typeorm

@Entity()
@Index(["encryptCurrentUserId", "encryptJobId", "profileId"], { unique: true })
export class JobCandidate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  encryptCurrentUserId: string;

  @Index()
  @Column()
  encryptJobId: string;

  @Column({
    default: ''
  })
  profileId: string;

  @Column()
  status: JobCandidateStatus;

  @Column({
    nullable: true
  })
  matchScore?: number;

  @Column({
    type: 'text',
    nullable: true
  })
  reasonJson?: string;

  @Column({
    type: 'text',
    nullable: true
  })
  jobSnapshotJson?: string;

  @Column({
    nullable: true
  })
  sourceKey?: string;

  @Column({
    nullable: true
  })
  searchKeyword?: string;

  @Column({
    nullable: true
  })
  filterConditionKey?: string;

  @Column()
  collectedAt: Date;

  @Column()
  statusUpdatedAt: Date;

  @Column({
    nullable: true
  })
  chatStartedAt?: Date;
}
