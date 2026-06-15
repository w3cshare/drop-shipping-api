import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * 待处理的 Webhook 事件队列表。
 * 当服务不可用时，Shopify 会重试 webhook；
 * 服务恢复后，从这里处理积压的事件。
 */
@Entity({ name: 'b_3rd_pending_events', comment: '待处理 Webhook 事件队列表' })
export class PendingEventEntity {
  @PrimaryGeneratedColumn('uuid', { comment: '事件 ID' })
  id: string;

  /** 店铺域名 */
  @Index()
  @Column({ name: 'shop', type: 'varchar', length: 255, comment: '店铺域名' })
  shop: string;

  /** 事件类型：orders/create, orders/updated, ... */
  @Index()
  @Column({ name: 'event_type', type: 'varchar', length: 50, comment: '事件类型' })
  eventType: string;

  /** 事件数据（JSON 字符串） */
  @Column({ name: 'payload', type: 'text', comment: '事件数据（JSON 字符串）' })
  payload: string;

  /** Shopify 事件 ID（用于去重） */
  @Index()
  @Column({ name: 'shopify_event_id', type: 'varchar', length: 255, nullable: true, comment: 'Shopify 事件 ID（用于去重）' })
  shopifyEventId: string | null;

  /** 处理状态：pending, processing, completed, failed */
  @Index()
  @Column({ name: 'status', type: 'varchar', length: 20, default: 'pending', comment: '处理状态' })
  status: 'pending' | 'processing' | 'completed' | 'failed';

  /** 重试次数 */
  @Column({ name: 'retry_count', type: 'int', default: 0, comment: '重试次数' })
  retryCount: number;

  /** 最近一次错误信息 */
  @Column({ name: 'last_error', type: 'text', nullable: true, comment: '最近一次错误信息' })
  lastError: string | null;

  /** 创建时间 */
  @CreateDateColumn({ name: 'created_time', comment: '创建时间' })
  createdAt: Date;

  /** 最近处理时间 */
  @Column({ name: 'processed_time', type: 'datetime', nullable: true, comment: '最近处理时间' })
  processedAt: Date | null;

  /** 计划重试时间 */
  @Index()
  @Column({ name: 'next_retry_time', type: 'datetime', nullable: true, comment: '计划重试时间' })
  nextRetryAt: Date | null;
}
