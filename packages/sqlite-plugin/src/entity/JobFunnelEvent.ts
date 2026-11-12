import { JobFunnelEventType, JobSource } from "../enums";
import * as typeorm from 'typeorm';
const { Entity, Column, PrimaryGeneratedColumn, Index } = typeorm

@Entity()
@Index(["encryptCurrentUserId", "eventDate"])
@Index(["sourceKey", "eventDate"])
@Index(["filterConditionKey", "eventDate"])
export class JobFunnelEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  encryptCurrentUserId: string;

  @Index()
  @Column({
    nullable: true
  })
  encryptJobId?: string;

  @Column({
    nullable: true
  })
  encryptBossId?: string;

  @Column()
  eventType: JobFunnelEventType;

  @Column()
  eventDate: Date;

  @Column({
    nullable: true
  })
  runRecordId?: number;

  @Column({
    nullable: true
  })
  jobSource?: JobSource;

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

  @Column({
    nullable: true
  })
  filterConditionJson?: string;

  @Column({
    nullable: true
  })
  skipReason?: string;

  @Column({
    nullable: true
  })
  matchScore?: number;

  @Column({
    nullable: true
  })
  extInfo?: string;
}
