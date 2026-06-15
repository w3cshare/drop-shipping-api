import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderSyncService } from './order-sync.service';
import { WebhookQueueService } from '../webhooks/webhook-queue.service';
import { ShopSessionEntity } from '../database/entities/shop-session.entity';

/**
 * 定时同步任务。
 *
 * 负责：
 * 1. 定时补偿同步缺失的订单（兜底机制）
 * 2. 清理过期的已处理事件
 * 3. 输出队列统计信息
 */
@Injectable()
export class SyncScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SyncScheduler.name);

  // 订单补偿同步间隔（毫秒）：每 5 分钟一次
  private readonly ORDER_SYNC_INTERVAL_MS = 5 * 60 * 1000;

  // 队列清理间隔（毫秒）：每小时一次
  private readonly CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

  // 是否正在运行
  private isRunning = false;

  // 定时器引用
  private orderSyncTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly orderSyncService: OrderSyncService,
    private readonly webhookQueueService: WebhookQueueService,
    @InjectRepository(ShopSessionEntity)
    private readonly sessionRepository: Repository<ShopSessionEntity>,
  ) {}

  onModuleInit() {
    this.start();
  }

  onModuleDestroy() {
    this.stop();
  }

  /**
   * 启动定时任务。
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.logger.log('Sync scheduler started');

    // 立即执行一次
    this.runOrderSync();

    // 定时执行
    this.orderSyncTimer = setInterval(
      () => this.runOrderSync(),
      this.ORDER_SYNC_INTERVAL_MS,
    );

    // 清理任务
    this.cleanupTimer = setInterval(
      () => this.runCleanup(),
      this.CLEANUP_INTERVAL_MS,
    );
  }

  /**
   * 停止定时任务。
   */
  stop(): void {
    this.isRunning = false;

    if (this.orderSyncTimer) {
      clearInterval(this.orderSyncTimer);
      this.orderSyncTimer = null;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    this.logger.log('Sync scheduler stopped');
  }

  /**
   * 执行订单同步。
   */
  private async runOrderSync(): Promise<void> {
    if (!this.isRunning) return;

    const startTime = Date.now();
    this.logger.log('=== Starting scheduled order sync ===');

    try {
      // 获取所有已授权的店铺
      const sessions = await this.sessionRepository.find({
        where: { sessionType: 'offline' as any },
        select: ['shop'],
      });

      this.logger.log(`Found ${sessions.length} authorized shops`);

      let totalSynced = 0;
      const results: { shop: string; synced: number; error?: string }[] = [];

      for (const session of sessions) {
        try {
          const synced = await this.orderSyncService.syncOrders(session.shop);
          results.push({ shop: session.shop, synced });
          totalSynced += synced;
        } catch (error: any) {
          results.push({ shop: session.shop, synced: 0, error: error.message });
          this.logger.error(`Failed to sync orders for ${session.shop}: ${error.message}`);
        }
      }

      // 输出统计
      const duration = Date.now() - startTime;
      this.logger.log(
        `=== Order sync completed: ${totalSynced} orders synced in ${duration}ms ===`,
      );

      if (results.some((r) => r.synced > 0)) {
        this.logger.debug(
          `Details: ${results.filter((r) => r.synced > 0).map((r) => `${r.shop}:${r.synced}`).join(', ')}`,
        );
      }
    } catch (error: any) {
      this.logger.error(`Order sync task failed: ${error.message}`, error.stack);
    }
  }

  /**
   * 执行清理任务。
   */
  private async runCleanup(): Promise<void> {
    if (!this.isRunning) return;

    this.logger.log('Running queue cleanup...');

    try {
      // 清理 7 天前的已处理事件
      const cleaned = await this.webhookQueueService.cleanupOldEvents(7);
      if (cleaned > 0) {
        this.logger.log(`Cleaned up ${cleaned} old events`);
      }

      // 输出队列统计
      const stats = await this.webhookQueueService.getQueueStats();
      this.logger.log(
        `Queue stats: pending=${stats.pending}, processing=${stats.processing}, failed=${stats.failed}`,
      );
    } catch (error: any) {
      this.logger.error(`Cleanup task failed: ${error.message}`);
    }
  }

  /**
   * 手动触发同步（用于测试或管理接口）。
   */
  async manualSync(shop?: string): Promise<{ shop: string; synced: number }[]> {
    if (shop) {
      const synced = await this.orderSyncService.syncOrders(shop);
      return [{ shop, synced }];
    }

    // 同步所有店铺
    const sessions = await this.sessionRepository.find({
      where: { sessionType: 'offline' as any },
      select: ['shop'],
    });

    const results: { shop: string; synced: number }[] = [];
    for (const session of sessions) {
      const synced = await this.orderSyncService.syncOrders(session.shop);
      results.push({ shop: session.shop, synced });
    }

    return results;
  }
}
