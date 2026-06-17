import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { SyncRecordEntity } from '../database/entities/sync-record.entity';
import { ShopifySessionService } from '../shopify/session/shopify-session.service';

/**
 * 三层补偿同步机制 - 抽象基类
 *
 * 统一 OrderSyncService 和 ProductSyncService 的共享逻辑：
 * 1. Webhook 实时接收 + 入队处理（第一层，见 WebhookModule）
 * 2. 事件队列异步处理（第二层，见 WebhookModule）
 * 3. 定时 REST API 全量同步兜底（第三层，本类核心）
 *
 * 子类只需实现：
 * - syncType: 'orders' | 'products' 等标识
 * - getLocalCount(shop): 本地数据量
 * - saveItem(shop, item): 保存单条数据
 * - fetchFromShopify(shop, start, end): 从 Shopify 拉取数据
 */
export abstract class BaseSyncService {
  protected readonly logger: Logger;

  protected readonly BATCH_SIZE = 250;
  protected readonly SYNC_HOURS_LOOKBACK = 24;
  protected readonly INITIAL_SYNC_DAYS = 7;

  /**
   * @param sessionService Shopify 会话服务，统一获取 accessToken
   * @param syncRecordRepository 同步状态记录
   * @param syncType 当前同步类型标识（如 'orders' | 'products'）
   */
  constructor(
    protected readonly sessionService: ShopifySessionService,
    protected readonly syncRecordRepository: Repository<SyncRecordEntity>,
    protected readonly syncType: string,
  ) {
    this.logger = new Logger(`${this.syncType.charAt(0).toUpperCase() + this.syncType.slice(1)}SyncService`);
  }

  /**
   * 主同步入口（增量/智能全量）
   */
  async sync(shop: string): Promise<number> {
    try {
      this.logger.log(`[Sync] Starting ${this.syncType} sync for shop: ${shop}`);

      const record = await this.getSyncRecord(shop);
      const localCount = await this.getLocalCount(shop);
      this.logger.debug(`[Sync] Local ${this.syncType} count: ${localCount}`);

      const lookbackHours = record ? this.SYNC_HOURS_LOOKBACK : this.INITIAL_SYNC_DAYS * 24;
      const lastSyncTime = record?.lastSyncAt
        ? new Date(record.lastSyncAt)
        : new Date(Date.now() - lookbackHours * 60 * 60 * 1000);

      const endTime = new Date();
      let startTime = lastSyncTime;

      this.logger.debug(
        `[Sync] Time range: ${startTime.toISOString()} to ${endTime.toISOString()}`,
      );

      await this.updateSyncRecord(shop, { status: 'syncing' });

      let items = await this.fetchFromShopify(shop, startTime, endTime);

      if (items.length === 0) {
        this.logger.debug(`[Sync] No new ${this.syncType} found for ${shop}`);
        await this.updateSyncRecord(shop, { status: 'idle', lastError: null });
        return 0;
      }

      this.logger.debug(`[Sync] Shopify returned ${items.length} ${this.syncType}`);

      // 智能检测：Shopify 数据量 > 本地时扩大回溯范围
      if (items.length > localCount && record) {
        this.logger.warn(
          `[Sync] Shopify has ${items.length} ${this.syncType} but local has ${localCount}. Expanding to ${this.INITIAL_SYNC_DAYS} days`,
        );
        startTime = new Date(Date.now() - this.INITIAL_SYNC_DAYS * 24 * 60 * 60 * 1000);
        const fullItems = await this.fetchFromShopify(shop, startTime, endTime);
        this.logger.debug(`[Sync] Full range returned ${fullItems.length} ${this.syncType}`);
        return this.processItems(shop, fullItems, localCount);
      }

      // 过滤已同步的数据（按 created_at >= lastSyncTime）
      const newItems = items.filter(
        (item) => new Date(item.created_at) >= lastSyncTime,
      );

      if (newItems.length === 0) {
        this.logger.debug(`[Sync] All ${items.length} ${this.syncType} already synced for ${shop}`);
        await this.updateSyncRecord(shop, {
          lastSyncAt: new Date(),
          status: 'idle',
          lastError: null,
        });
        return 0;
      }

      return this.processItems(shop, newItems, localCount);
    } catch (error: any) {
      this.logger.error(`[Sync] Failed for ${shop}: ${error.message}`, error.stack);
      await this.updateSyncRecord(shop, {
        status: 'error',
        lastError: error.message,
      });
      return 0;
    }
  }

  /**
   * 处理一批数据：循环保存 → 写同步记录 → 打日志
   */
  private async processItems(
    shop: string,
    items: any[],
    localCount: number,
  ): Promise<number> {
    let syncedCount = 0;
    let failedCount = 0;

    for (const item of items) {
      try {
        await this.saveItem(shop, item);
        syncedCount++;
      } catch (error: any) {
        failedCount++;
        this.logger.error(`[Sync] Failed to save ${this.syncType} ${item.id}: ${error.message}`);
      }
    }

    const latest = items[items.length - 1];
    await this.updateSyncRecord(shop, {
      lastSyncAt: new Date(),
      lastSyncId: String(latest.id),
      lastOrderTime: new Date(latest.created_at),
      lastSyncCount: syncedCount,
      status: 'idle',
      lastError: null,
    });

    const newLocalCount = await this.getLocalCount(shop);
    this.logger.log(
      `[Sync] ${this.syncType} completed for ${shop}: ${syncedCount} processed, ${failedCount} failed, local: ${localCount} -> ${newLocalCount}`,
    );

    return syncedCount;
  }

  /**
   * 强制全量同步（指定起始时间）
   */
  async forceSync(shop: string, since: Date): Promise<number> {
    try {
      this.logger.log(`[ForceSync] Starting ${this.syncType} for ${shop} since ${since.toISOString()}`);

      await this.updateSyncRecord(shop, { status: 'syncing' });

      const items = await this.fetchFromShopify(shop, since, new Date());
      this.logger.debug(`[ForceSync] Fetched ${items.length} ${this.syncType}`);

      const localCount = await this.getLocalCount(shop);
      const synced = await this.processItems(shop, items, localCount);

      this.logger.log(`[ForceSync] ${this.syncType} completed for ${shop}: ${synced} synced`);
      return synced;
    } catch (error: any) {
      this.logger.error(`[ForceSync] Failed for ${shop}: ${error.message}`, error.stack);
      await this.updateSyncRecord(shop, {
        status: 'error',
        lastError: error.message,
      });
      return 0;
    }
  }

  /**
   * 获取同步状态（所有店铺）
   */
  async getSyncStatus(): Promise<SyncRecordEntity[]> {
    return this.syncRecordRepository.find({
      where: { syncType: this.syncType },
      order: { lastSyncAt: 'DESC' },
    });
  }

  // ---------------- 辅助方法（私有，基类内部使用） ----------------

  private async getSyncRecord(shop: string): Promise<SyncRecordEntity | null> {
    return this.syncRecordRepository.findOne({
      where: { shop, syncType: this.syncType },
    });
  }

  private async updateSyncRecord(
    shop: string,
    data: Partial<SyncRecordEntity>,
  ): Promise<void> {
    await this.syncRecordRepository.upsert(
      { shop, syncType: this.syncType, ...data },
      { conflictPaths: ['shop', 'syncType'] },
    );
  }

  // ---------------- 子类必须实现 ----------------

  /**
   * 获取本地数据量（用于智能检测）
   */
  protected abstract getLocalCount(shop: string): Promise<number>;

  /**
   * 保存单条数据到数据库
   */
  protected abstract saveItem(shop: string, item: any): Promise<any>;

  /**
   * 从 Shopify REST API 拉取指定时间范围的数据
   */
  protected abstract fetchFromShopify(
    shop: string,
    startTime: Date,
    endTime: Date,
  ): Promise<any[]>;
}
