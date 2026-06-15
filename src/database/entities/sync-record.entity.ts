import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 同步记录表。
 * 记录每个店铺各类型数据的最后同步时间，支持断点续传。
 */
@Entity({ name: 'b_3rd_sync_records', comment: '数据同步记录表' })
export class SyncRecordEntity {
  /** 店铺域名（复合主键） */
  @PrimaryColumn({ name: 'shop', type: 'varchar', length: 255, comment: '店铺域名' })
  shop: string;

  /** 同步类型：orders, products, customers */
  @PrimaryColumn({ name: 'sync_type', type: 'varchar', length: 50, comment: '同步类型' })
  syncType: string;

  /** 最后成功同步的时间 */
  @Column({ name: 'last_sync_time', type: 'datetime', nullable: true, comment: '最后成功同步的时间' })
  lastSyncAt: Date | null;

  /** 最后同步的订单 ID（用于断点续传） */
  @Column({ name: 'last_sync_id', type: 'bigint', nullable: true, comment: '最后同步的订单 ID（用于断点续传）' })
  lastSyncId: string | null;

  /** 最后同步的订单时间 */
  @Column({ name: 'last_order_time', type: 'datetime', nullable: true, comment: '最后同步的订单时间' })
  lastOrderTime: Date | null;

  /** 同步状态：idle, syncing, error */
  @Column({ name: 'status', type: 'varchar', length: 20, default: 'idle', comment: '同步状态' })
  status: 'idle' | 'syncing' | 'error';

  /** 最后错误信息 */
  @Column({ name: 'last_error', type: 'text', nullable: true, comment: '最后错误信息' })
  lastError: string | null;

  /** 最后成功同步的记录数 */
  @Column({ name: 'last_sync_count', type: 'int', default: 0, comment: '最后成功同步的记录数' })
  lastSyncCount: number;

  @CreateDateColumn({ name: 'created_time', comment: '创建时间' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'modified_time', comment: '更新时间' })
  updatedAt: Date;
}
