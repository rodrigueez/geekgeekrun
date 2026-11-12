import { JobSource } from "../enums";
import * as typeorm from 'typeorm';
const { Entity, Column, PrimaryGeneratedColumn, Index } = typeorm

export enum ChatStartupFrom {
  AutoFromRecommendList = null,
  ManuallyFromRecommendList = 1
}

@Entity()
@Index(["encryptCurrentUserId", "date"])
export class ChatStartupLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  encryptJobId: string;

  @Column()
  encryptCurrentUserId: string;

  @Index()
  @Column()
  date: Date;

  @Column({
    nullable: true
  })
  chatStartupFrom?: ChatStartupFrom;

  @Column({
    nullable: true
  })
  autoStartupChatRecordId?: number;

  @Column({
    nullable: true
  })
  jobSource?: JobSource;
}
