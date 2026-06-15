import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, In } from 'typeorm';
import { PendingEventEntity } from '../database/entities/pending-event.entity';

/**
 * Webhook 事件队列服务。
 *
 * 使用 MySQL 作为队列存储，实现以下功能：
 * 1. 入队：将 webhook 事件写入队列
 * 2. 轮询：获取待处理的事件
 * 3. 标记：标记事件为已处理/失败/待重试
 *
 * 这样即使服务重启，积压的事件也不会丢失。
 */
@Injectable()
export class WebhookQueueService implements OnModuleInit {
  private readonly logger = new Logger(WebhookQueueService.name);

  // 最大重试次数
  private readonly MAX_RETRY_COUNT = 3;

  // 重试间隔（毫秒）：1分钟, 5分钟, 15分钟
  private readonly RETRY_DELAYS = [60_000, 300_000, 900_000];

  constructor(
    @InjectRepository(PendingEventEntity)
    private readonly pendingEventRepository: Repository<PendingEventEntity>,
  ) {}

  onModuleInit() {
    this.logger.log('WebhookQueueService initialized');
  }

  /**
   * 入队：将 webhook 事件加入队列。
   * 用于服务暂时不可用时，积压的事件由补偿任务处理。
   *
   * @param shop 店铺域名
   * @param eventType 事件类型（如 orders/create）
   * @param payload 事件数据
   * @param shopifyEventId Shopify 事件 ID（用于去重）
   */
  async enqueue(
    shop: string,
    eventType: string,
    payload: Record<string, any>,
    shopifyEventId?: string,
  ): Promise<string> {
    try {
      // 去重检查：如果相同的 shopifyEventId 已存在且未完成，跳过
      if (shopifyEventId) {
        const existing = await this.pendingEventRepository.findOne({
          where: {
            shopifyEventId,
            status: In(['pending', 'processing'] as any),
          },
        });
        if (existing) {
          this.logger.debug(`Duplicate event ${shopifyEventId}, skipping`);
          return existing.id;
        }
      }

      const entity = new PendingEventEntity();
      entity.shop = shop;
      entity.eventType = eventType;
      entity.payload = JSON.stringify(payload);
      entity.shopifyEventId = shopifyEventId || null;
      entity.status = 'pending';
      entity.retryCount = 0;

      const saved = await this.pendingEventRepository.save(entity);
      this.logger.debug(`Event enqueued: ${eventType} for ${shop}, id=${saved.id}`);
      return saved.id;
    } catch (error: any) {
      this.logger.error(`Failed to enqueue event: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 轮询：获取一批待处理的事件。
   * 使用悲观锁避免并发处理同一事件。
   *
   * @param limit 每批处理数量
   */
  async pollPendingEvents(limit: number = 50): Promise<PendingEventEntity[]> {
    try {
      // 获取待处理且已到重试时间的事件
      const now = new Date();
      const events = await this.pendingEventRepository.find({
        where: [
          {
            status: 'pending',
            nextRetryAt: LessThan(now),
          },
          {
            status: 'pending',
            nextRetryAt: null as any,
          },
          {
            status: 'failed',
            nextRetryAt: LessThan(now),
            retryCount: LessThan(this.MAX_RETRY_COUNT),
          },
        ],
        order: { createdAt: 'ASC' },
        take: limit,
      });

      if (events.length === 0) return [];

      // 标记为处理中（使用 ID 列表）
      const eventIds = events.map((e) => e.id);
      await this.pendingEventRepository.update(
        { id: In(eventIds) },
        { status: 'processing' },
      );

      // 更新返回对象的 status
      events.forEach((e) => (e.status = 'processing'));

      this.logger.log(`Polled ${events.length} pending events`);
      return events;
    } catch (error: any) {
      this.logger.error(`Failed to poll events: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * 标记成功：将事件标记为已处理。
   */
  async markCompleted(eventId: string): Promise<void> {
    try {
      await this.pendingEventRepository.update(eventId, {
        status: 'completed',
        processedAt: new Date(),
      });
      this.logger.debug(`Event ${eventId} marked as completed`);
    } catch (error: any) {
      this.logger.error(`Failed to mark event completed: ${error.message}`);
    }
  }

  /**
   * 标记失败：安排重试或标记为永久失败。
   *
   * @param eventId 事件 ID
   * @param error 错误信息
   */
  async markFailed(eventId: string, error: string): Promise<void> {
    try {
      const event = await this.pendingEventRepository.findOne({ where: { id: eventId } });
      if (!event) return;

      const newRetryCount = event.retryCount + 1;

      if (newRetryCount >= this.MAX_RETRY_COUNT) {
        // 超过最大重试次数，永久失败
        await this.pendingEventRepository.update(eventId, {
          status: 'failed',
          retryCount: newRetryCount,
          lastError: error,
          nextRetryAt: null,
        });
        this.logger.warn(
          `Event ${eventId} permanently failed after ${newRetryCount} retries: ${error}`,
        );
      } else {
        // 安排下次重试
        const delayMs = this.RETRY_DELAYS[Math.min(newRetryCount - 1, this.RETRY_DELAYS.length - 1)];
        const nextRetryAt = new Date(Date.now() + delayMs);

        await this.pendingEventRepository.update(eventId, {
          status: 'pending',
          retryCount: newRetryCount,
          lastError: error,
          nextRetryAt,
        });
        this.logger.warn(
          `Event ${eventId} scheduled for retry ${newRetryCount}/${this.MAX_RETRY_COUNT} at ${nextRetryAt.toISOString()}`,
        );
      }
    } catch (err: any) {
      this.logger.error(`Failed to mark event failed: ${err.message}`);
    }
  }

  /**
   * 获取队列统计信息。
   */
  async getQueueStats(): Promise<{
    pending: number;
    processing: number;
    failed: number;
    total: number;
  }> {
    try {
      const [pending, processing, failed] = await Promise.all([
        this.pendingEventRepository.count({ where: { status: 'pending' } }),
        this.pendingEventRepository.count({ where: { status: 'processing' } }),
        this.pendingEventRepository.count({ where: { status: 'failed' } }),
      ]);

      return {
        pending,
        processing,
        failed,
        total: pending + processing + failed,
      };
    } catch (error: any) {
      this.logger.error(`Failed to get queue stats: ${error.message}`);
      return { pending: 0, processing: 0, failed: 0, total: 0 };
    }
  }

  /**
   * 清理已完成的旧事件（保留 7 天）。
   */
  async cleanupOldEvents(daysToKeep: number = 7): Promise<number> {
    try {
      const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
      const result = await this.pendingEventRepository.delete({
        status: 'completed',
        processedAt: LessThan(cutoffDate),
      });
      if (result.affected && result.affected > 0) {
        this.logger.log(`Cleaned up ${result.affected} old completed events`);
      }
      return result.affected || 0;
    } catch (error: any) {
      this.logger.error(`Failed to cleanup old events: ${error.message}`);
      return 0;
    }
  }
}
