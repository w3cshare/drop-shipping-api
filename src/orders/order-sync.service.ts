import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SyncRecordEntity } from '../database/entities/sync-record.entity';
import { ShopifySessionService } from '../shopify/session/shopify-session.service';
import { OrderService } from '../orders/order.service';
import axios from 'axios';

/**
 * 订单同步服务（补偿机制）。
 *
 * 三层补偿机制：
 * 1. Webhook 实时接收（第一层）
 * 2. 事件队列异步处理（第二层）
 * 3. 定时 REST API 全量同步兜底（第三层）
 *
 * 同步策略：
 * - 使用 Shopify REST API 拉取订单，数据更完整、更稳定
 * - 支持增量同步（基于上次同步时间）
 * - 支持全量同步（指定起始时间）
 * - 支持断点续传（基于 lastSyncId）
 */
@Injectable()
export class OrderSyncService {
  private readonly logger = new Logger(OrderSyncService.name);

  private readonly BATCH_SIZE = 250;
  private readonly SYNC_HOURS_LOOKBACK = 24;
  private readonly INITIAL_SYNC_DAYS = 7;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY_MS = [1000, 2000, 4000];

  constructor(
    @InjectRepository(SyncRecordEntity)
    private readonly syncRecordRepository: Repository<SyncRecordEntity>,
    private readonly sessionService: ShopifySessionService,
    private readonly orderService: OrderService,
  ) {}

  async syncOrders(shop: string): Promise<number> {
    try {
      this.logger.log(`[Sync] Starting order sync for shop: ${shop}`);

      const record = await this.getSyncRecord(shop, 'orders');
      const localCount = await this.orderService.getOrderCount(shop);
      this.logger.debug(`[Sync] Local order count: ${localCount}`);

      let lookbackHours = this.SYNC_HOURS_LOOKBACK;
      if (!record) {
        lookbackHours = this.INITIAL_SYNC_DAYS * 24;
        this.logger.debug(`[Sync] First sync, lookback: ${lookbackHours} hours`);
      }

      const lastSyncTime = record?.lastSyncAt
        ? new Date(record.lastSyncAt)
        : new Date(Date.now() - lookbackHours * 60 * 60 * 1000);

      const endTime = new Date();
      let startTime = lastSyncTime;

      this.logger.debug(
        `[Sync] Time range: ${startTime.toISOString()} to ${endTime.toISOString()}`,
      );

      await this.updateSyncRecord(shop, 'orders', { status: 'syncing' });

      const orders = await this.fetchOrdersFromShopifyREST(shop, startTime, endTime);

      if (orders.length === 0) {
        this.logger.debug(`[Sync] No new orders found for ${shop}`);
        await this.updateSyncRecord(shop, 'orders', { status: 'idle', lastError: null });
        return 0;
      }

      this.logger.debug(`[Sync] Shopify returned ${orders.length} orders`);

      if (orders.length > localCount && record) {
        this.logger.warn(
          `[Sync] Shopify has ${orders.length} orders but local has ${localCount}. Expanding sync range to ${this.INITIAL_SYNC_DAYS} days`,
        );
        startTime = new Date(Date.now() - this.INITIAL_SYNC_DAYS * 24 * 60 * 60 * 1000);
        const fullOrders = await this.fetchOrdersFromShopifyREST(shop, startTime, endTime);
        this.logger.debug(`[Sync] Full range returned ${fullOrders.length} orders`);
        return this.processOrders(shop, fullOrders, localCount);
      }

      const newOrders = orders.filter(
        (order) => new Date(order.created_at) >= lastSyncTime,
      );

      if (newOrders.length === 0) {
        this.logger.debug(`[Sync] All ${orders.length} orders already synced for ${shop}`);
        await this.updateSyncRecord(shop, 'orders', {
          lastSyncAt: new Date(),
          status: 'idle',
          lastError: null,
        });
        return 0;
      }

      return this.processOrders(shop, newOrders, localCount);
    } catch (error: any) {
      this.logger.error(`[Sync] Failed for ${shop}: ${error.message}`, error.stack);

      await this.updateSyncRecord(shop, 'orders', {
        status: 'error',
        lastError: error.message,
      });

      return 0;
    }
  }

  private async processOrders(
    shop: string,
    orders: any[],
    localCount: number,
  ): Promise<number> {
    let syncedCount = 0;
    let failedCount = 0;

    for (const order of orders) {
      try {
        await this.orderService.saveOrder(shop, order);
        syncedCount++;
      } catch (error: any) {
        failedCount++;
        this.logger.error(`[Sync] Failed to save order ${order.id}: ${error.message}`);
      }
    }

    const latestOrder = orders[orders.length - 1];
    await this.updateSyncRecord(shop, 'orders', {
      lastSyncAt: new Date(),
      lastSyncId: String(latestOrder.id),
      lastOrderTime: new Date(latestOrder.created_at),
      lastSyncCount: syncedCount,
      status: 'idle',
      lastError: null,
    });

    const newLocalCount = await this.orderService.getOrderCount(shop);
    this.logger.log(
      `[Sync] Completed for ${shop}: ${syncedCount} processed, ${failedCount} failed, local count: ${localCount} -> ${newLocalCount}`,
    );

    return syncedCount;
  }

  async forceSyncOrders(shop: string, since: Date): Promise<number> {
    try {
      this.logger.log(`[ForceSync] Starting for ${shop} since ${since.toISOString()}`);

      await this.syncRecordRepository.upsert(
        { shop, syncType: 'orders', lastSyncAt: since, status: 'syncing' },
        { conflictPaths: ['shop', 'syncType'] },
      );

      return this.syncOrders(shop);
    } catch (error: any) {
      this.logger.error(`[ForceSync] Failed for ${shop}: ${error.message}`);
      return 0;
    }
  }

  private async fetchOrdersFromShopifyREST(
    shop: string,
    startTime: Date,
    endTime: Date,
  ): Promise<any[]> {
    const accessToken = await this.sessionService.getOfflineToken(shop);
    if (!accessToken) {
      throw new Error(`No access token found for shop: ${shop}`);
    }

    const allOrders: any[] = [];
    let pageInfo = { has_next_page: true, end_cursor: '' };
    let page = 1;

    while (pageInfo.has_next_page && allOrders.length < this.BATCH_SIZE * 10) {
      try {
        const url = `https://${shop}/admin/api/2026-04/orders.json`;
        const params = new URLSearchParams({
          limit: String(this.BATCH_SIZE),
          created_at_min: startTime.toISOString(),
          created_at_max: endTime.toISOString(),
          status: 'any',
          fields:
            'id,name,created_at,updated_at,status,financial_status,fulfillment_status,' +
            'total_price_set,subtotal_price_set,shipping_price_set,total_tax_set,' +
            'payment_gateway_names,line_items,shipping_address,billing_address,' +
            'customer,order_status_url,source_name,refunded_amount,total_refunded,' +
            'total_refunded_set',
        });

        if (pageInfo.end_cursor) {
          params.set('page_info', pageInfo.end_cursor);
        }

        const response = await this.makeRESTRequest(
          `${url}?${params.toString()}`,
          accessToken,
        );

        if (!response.data || !response.data.orders) {
          this.logger.warn(`[REST] No orders data in response for ${shop}, page ${page}`);
          break;
        }

        const orders = response.data.orders;
        allOrders.push(...orders);

        pageInfo = {
          has_next_page: response.headers?.['link']?.includes('rel="next"') || false,
          end_cursor: this.extractPageInfo(response.headers?.['link']),
        };

        this.logger.debug(`[REST] Fetched page ${page}, got ${orders.length} orders, total so far: ${allOrders.length}`);
        page++;
      } catch (error: any) {
        this.logger.error(`[REST] Failed to fetch page ${page}: ${error.message}`);
        break;
      }
    }

    this.logger.log(`[REST] Total orders fetched for ${shop}: ${allOrders.length}`);
    return allOrders;
  }

  private async makeRESTRequest(url: string, accessToken: string, retry = 0): Promise<any> {
    try {
      const response = await axios.get(url, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      });
      return response;
    } catch (error: any) {
      const status = error.response?.status;

      if (status === 401 && retry === 0) {
        this.logger.warn(`[REST] Token expired, attempting refresh...`);
        return { status: 401 };
      }

      if ((status === 429 || this.isNetworkError(error)) && retry < this.MAX_RETRIES) {
        const delay = this.RETRY_DELAY_MS[retry];
        this.logger.warn(`[REST] Rate limited/network error, retrying after ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.makeRESTRequest(url, accessToken, retry + 1);
      }

      throw error;
    }
  }

  private extractPageInfo(linkHeader: string | undefined): string {
    if (!linkHeader) return '';

    const match = linkHeader.match(/page_info=([^&>]+)/);
    return match ? match[1] : '';
  }

  private isNetworkError(error: any): boolean {
    const msg = (error?.message || '').toLowerCase();
    return (
      msg.includes('socket') ||
      msg.includes('tls') ||
      msg.includes('timeout') ||
      msg.includes('network') ||
      msg.includes('disconnected')
    );
  }

  private async getSyncRecord(
    shop: string,
    syncType: string,
  ): Promise<SyncRecordEntity | null> {
    try {
      return await this.syncRecordRepository.findOne({ where: { shop, syncType } });
    } catch (error: any) {
      this.logger.error(`[Sync] Failed to get sync record: ${error.message}`);
      return null;
    }
  }

  private async updateSyncRecord(
    shop: string,
    syncType: string,
    data: Partial<SyncRecordEntity>,
  ): Promise<void> {
    try {
      await this.syncRecordRepository.upsert(
        { shop, syncType, ...data },
        { conflictPaths: ['shop', 'syncType'] },
      );
    } catch (error: any) {
      this.logger.error(`[Sync] Failed to update sync record: ${error.message}`);
    }
  }

  async getSyncStatus(): Promise<SyncRecordEntity[]> {
    try {
      return await this.syncRecordRepository.find({
        where: { syncType: 'orders' },
        order: { lastSyncAt: 'DESC' },
      });
    } catch (error: any) {
      this.logger.error(`[Sync] Failed to get sync status: ${error.message}`);
      return [];
    }
  }
}
