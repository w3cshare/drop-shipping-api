import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, Interval, SchedulerRegistry } from '@nestjs/schedule';
import { OrderSyncService } from './order-sync.service';
import { ProductSyncService } from './product-sync.service';
import { WebhookQueueService } from '../webhooks/webhook-queue.service';
import { ShopSessionEntity } from '../database/entities/shop-session.entity';
import { SyncRecordEntity } from '../database/entities/sync-record.entity';

/**
 * 定时同步任务调度器（基于 NestJS Schedule 模块）
 *
 * 三层补偿机制：
 * 1. Webhook 实时接收 -> 写入队列 -> 异步处理
 * 2. WebhookQueue 定时轮询（每 30 秒）-> 处理积压事件
 * 3. OrderSync/ProductSync 定时全量同步 -> 兜底补偿缺失数据
 * 4. Webhook 事件清理（每小时）-> 删除 7 天前的已处理事件
 *
 * 使用 @nestjs/schedule 装饰器管理定时任务，框架自动处理：
 * - 应用启动时自动注册任务
 * - 应用关闭时自动清理
 * - 任务抛错不影响其他任务
 */
@Injectable()
export class SyncScheduler implements OnModuleInit {
  private readonly logger = new Logger(SyncScheduler.name);

  constructor(
    private readonly orderSyncService: OrderSyncService,
    private readonly productSyncService: ProductSyncService,
    private readonly webhookQueueService: WebhookQueueService,
    private readonly schedulerRegistry: SchedulerRegistry,
    @InjectRepository(ShopSessionEntity)
    private readonly sessionRepository: Repository<ShopSessionEntity>,
    @InjectRepository(SyncRecordEntity)
    private readonly syncRecordRepository: Repository<SyncRecordEntity>,
  ) {}

  /**
   * 模块初始化：立即执行一次订单和商品同步（首次启动不等待 cron）
   */
  async onModuleInit() {
    this.logger.log('[Scheduler] Initialized with NestJS Schedule');
    // 启动时立即触发一次订单和商品同步（不阻塞应用启动）
    setImmediate(() => {
      this.runOrderSync().catch((err) => {
        this.logger.error(`[Scheduler] Initial order sync failed: ${err.message}`);
      });
      this.runProductSync().catch((err) => {
        this.logger.error(`[Scheduler] Initial product sync failed: ${err.message}`);
      });
    });
  }

  /**
   * 订单同步：每 5 分钟执行一次
   * cron: 0 [每 5 分钟] * * * *
   */
  @Cron('0 */5 * * * *', {
    name: 'orderSync',
    timeZone: 'Asia/Shanghai',
  })
  async handleOrderSyncCron() {
    await this.runOrderSync();
  }

  /**
   * 商品同步：每 10 分钟执行一次（与订单同步错开）
   * cron: 0 [每 10 分钟] * * * *
   */
  @Cron('0 */10 * * * *', {
    name: 'productSync',
    timeZone: 'Asia/Shanghai',
  })
  async handleProductSyncCron() {
    await this.runProductSync();
  }

  /**
   * 队列检查：每 30 秒一次
   */
  @Interval('queueCheck', 30 * 1000)
  async handleQueueCheckInterval() {
    try {
      const stats = await this.webhookQueueService.getQueueStats();

      if (stats.pending > 0 || stats.processing > 0) {
        this.logger.debug(
          `[Scheduler] Queue stats: pending=${stats.pending}, processing=${stats.processing}, failed=${stats.failed}`,
        );
      }

      if (stats.failed > 0) {
        this.logger.warn(`[Scheduler] ${stats.failed} failed events in queue`);
      }
    } catch (error: any) {
      this.logger.error(`[Scheduler] Queue check failed: ${error.message}`);
    }
  }

  /**
   * 清理任务：每小时一次
   * 清理 7 天前的已处理事件
   */
  @Interval('cleanup', 60 * 60 * 1000)
  async handleCleanupInterval() {
    try {
      this.logger.log('[Scheduler] Running queue cleanup...');
      const cleaned = await this.webhookQueueService.cleanupOldEvents(7);
      if (cleaned > 0) {
        this.logger.log(`[Scheduler] Cleaned up ${cleaned} old completed events`);
      }

      const stats = await this.webhookQueueService.getQueueStats();
      this.logger.log(
        `[Scheduler] Queue stats: pending=${stats.pending}, processing=${stats.processing}, failed=${stats.failed}`,
      );

      const syncStatus = await this.syncRecordRepository.find({
        where: { syncType: 'orders' },
        order: { lastSyncAt: 'DESC' },
      });
      if (syncStatus.length > 0) {
        this.logger.debug(
          `[Scheduler] Sync status: ${syncStatus
            .map((s) => `${s.shop}: ${s.status}`)
            .join(', ')}`,
        );
      }
    } catch (error: any) {
      this.logger.error(`[Scheduler] Cleanup task failed: ${error.message}`);
    }
  }

  /**
   * 执行订单同步（核心逻辑）
   */
  private async runOrderSync(): Promise<void> {
    const startTime = Date.now();
    this.logger.log('[Scheduler] === Starting scheduled order sync ===');

    try {
      const sessions = await this.sessionRepository.find({
        where: { sessionType: 'offline' as any },
        select: ['shop'],
      });

      this.logger.log(`[Scheduler] Found ${sessions.length} authorized shops`);

      let totalSynced = 0;
      let successCount = 0;
      let failedCount = 0;
      const results: { shop: string; synced: number; error?: string }[] = [];

      for (const session of sessions) {
        try {
          const synced = await this.orderSyncService.syncOrders(session.shop);
          results.push({ shop: session.shop, synced });
          totalSynced += synced;
          successCount++;
        } catch (error: any) {
          results.push({ shop: session.shop, synced: 0, error: error.message });
          failedCount++;
          this.logger.error(`[Scheduler] Failed to sync ${session.shop}: ${error.message}`);
        }
      }

      const duration = Date.now() - startTime;
      const summary =
        `[Scheduler] === Order sync completed ===\n` +
        `  Duration: ${duration}ms\n` +
        `  Shops: ${successCount} success, ${failedCount} failed\n` +
        `  Orders synced: ${totalSynced}`;

      this.logger.log(summary);

      if (results.some((r) => r.synced > 0)) {
        const details = results
          .filter((r) => r.synced > 0)
          .map((r) => `${r.shop}:${r.synced}`)
          .join(', ');
        this.logger.debug(`[Scheduler] Sync details: ${details}`);
      }
    } catch (error: any) {
      this.logger.error(`[Scheduler] Order sync task failed: ${error.message}`, error.stack);
    }
  }

  /**
   * 执行商品同步（核心逻辑）
   */
  private async runProductSync(): Promise<void> {
    const startTime = Date.now();
    this.logger.log('[Scheduler] === Starting scheduled product sync ===');

    try {
      const sessions = await this.sessionRepository.find({
        where: { sessionType: 'offline' as any },
        select: ['shop'],
      });

      this.logger.log(`[Scheduler] Found ${sessions.length} authorized shops`);

      let totalSynced = 0;
      let successCount = 0;
      let failedCount = 0;
      const results: { shop: string; synced: number; error?: string }[] = [];

      for (const session of sessions) {
        try {
          const synced = await this.productSyncService.syncProducts(session.shop);
          results.push({ shop: session.shop, synced });
          totalSynced += synced;
          successCount++;
        } catch (error: any) {
          results.push({ shop: session.shop, synced: 0, error: error.message });
          failedCount++;
          this.logger.error(`[Scheduler] Failed to sync products for ${session.shop}: ${error.message}`);
        }
      }

      const duration = Date.now() - startTime;
      const summary =
        `[Scheduler] === Product sync completed ===\n` +
        `  Duration: ${duration}ms\n` +
        `  Shops: ${successCount} success, ${failedCount} failed\n` +
        `  Products synced: ${totalSynced}`;

      this.logger.log(summary);

      if (results.some((r) => r.synced > 0)) {
        const details = results
          .filter((r) => r.synced > 0)
          .map((r) => `${r.shop}:${r.synced}`)
          .join(', ');
        this.logger.debug(`[Scheduler] Product sync details: ${details}`);
      }
    } catch (error: any) {
      this.logger.error(`[Scheduler] Product sync task failed: ${error.message}`, error.stack);
    }
  }

  /**
   * 手动触发同步（用于测试或管理接口）
   */
  async manualSync(shop?: string): Promise<{ shop: string; synced: number }[]> {
    if (shop) {
      this.logger.log(`[Scheduler] Manual sync requested for: ${shop}`);
      const synced = await this.orderSyncService.syncOrders(shop);
      return [{ shop, synced }];
    }

    const sessions = await this.sessionRepository.find({
      where: { sessionType: 'offline' as any },
      select: ['shop'],
    });

    this.logger.log(`[Scheduler] Manual sync requested for all ${sessions.length} shops`);

    const results: { shop: string; synced: number }[] = [];
    for (const session of sessions) {
      const synced = await this.orderSyncService.syncOrders(session.shop);
      results.push({ shop: session.shop, synced });
    }

    return results;
  }

  /**
   * 强制全量同步（回溯最近 7 天）
   */
  async forceFullSync(shop: string): Promise<number> {
    this.logger.log(`[Scheduler] Force full sync requested for: ${shop}`);
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return this.orderSyncService.forceSyncOrders(shop, since);
  }

  /**
   * 获取同步状态概览
   */
  async getSyncSummary(): Promise<{
    shops: { shop: string; status: string; lastSyncAt?: Date; lastOrderTime?: Date; lastSyncCount?: number }[];
    queueStats: { pending: number; processing: number; failed: number };
    cronJobs: { name: string }[];
  }> {
    const sessions = await this.sessionRepository.find({
      where: { sessionType: 'offline' as any },
      select: ['shop'],
    });

    const syncStatus = await this.orderSyncService.getSyncStatus();
    const queueStats = await this.webhookQueueService.getQueueStats();

    const shops = sessions.map((session) => {
      const status = syncStatus.find((s) => s.shop === session.shop);
      return {
        shop: session.shop,
        status: status?.status || 'unknown',
        lastSyncAt: status?.lastSyncAt || undefined,
        lastOrderTime: status?.lastOrderTime || undefined,
        lastSyncCount: status?.lastSyncCount || undefined,
      };
    });

    // 获取所有注册的 cron 任务
    const cronJobs = this.schedulerRegistry.getCronJobs();
    const cronList: { name: string }[] = [];
    for (const name of cronJobs.keys()) {
      cronList.push({ name });
    }

    return { shops, queueStats, cronJobs: cronList };
  }

  /**
   * 动态停止某个 cron 任务
   */
  stopJob(name: string): void {
    try {
      const job = this.schedulerRegistry.getCronJob(name);
      job.stop();
      this.logger.log(`[Scheduler] Stopped cron job: ${name}`);
    } catch (e: any) {
      this.logger.warn(`[Scheduler] Failed to stop job ${name}: ${e.message}`);
    }
  }

  /**
   * 动态启动某个 cron 任务
   */
  startJob(name: string): void {
    try {
      const job = this.schedulerRegistry.getCronJob(name);
      job.start();
      this.logger.log(`[Scheduler] Started cron job: ${name}`);
    } catch (e: any) {
      this.logger.warn(`[Scheduler] Failed to start job ${name}: ${e.message}`);
    }
  }
}