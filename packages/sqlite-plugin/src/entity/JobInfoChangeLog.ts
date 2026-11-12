import * as typeorm from 'typeorm';
const { Entity, PrimaryGeneratedColumn, Column, Index } = typeorm

@Entity()
export class JobInfoChangeLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  encryptJobId: string;

  @Index()
  @Column()
  updateTime: Date;

  @Column()
  dataAsJson: string;
}
