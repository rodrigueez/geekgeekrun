import { JobHireStatus } from "../enums";
import * as typeorm from 'typeorm';
const { Entity, Column, PrimaryColumn, Index } = typeorm;

@Entity()
export class JobHireStatusRecord {
  @PrimaryColumn()
  encryptJobId: string;

  @Index()
  @Column({
    nullable: true
  })
  encryptCurrentUserId?: string;

  @Index()
  @Column()
  hireStatus: JobHireStatus;

  @Index()
  @Column()
  lastSeenDate: Date;
}
