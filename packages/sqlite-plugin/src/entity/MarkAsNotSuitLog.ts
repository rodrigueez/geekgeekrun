import { JobSource, MarkAsNotSuitOp, MarkAsNotSuitReason } from "../enums";
import * as typeorm from 'typeorm';
import { ChatStartupFrom } from "./ChatStartupLog";
const { Entity, Column, PrimaryGeneratedColumn, Index } = typeorm

@Entity()
@Index(["encryptCurrentUserId", "date"])
export class MarkAsNotSuitLog {
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
  markFrom?: ChatStartupFrom;

  @Column({
    nullable: true
  })
  markReason?: MarkAsNotSuitReason

  @Column({
    nullable: true
  })
  markOp?: MarkAsNotSuitOp

  @Column({
    nullable: true
  })
  extInfo?: string

  @Column({
    nullable: true
  })
  autoStartupChatRecordId?: number;

  @Column({
    nullable: true
  })
  jobSource?: JobSource;
}
