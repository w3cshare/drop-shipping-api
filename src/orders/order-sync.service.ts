import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { SyncRecordEntity } from '../database/entities/sync-record.entity';
import { ShopifyGraphqlService } from '../shopify/graphql/graphql.service';
import { OrderService } from '../orders/order.service';

/**
 * 订单同步服务（补偿机制）。
 *
 * 当 Webhook 不可用或失败时，通过定时轮询 Shopify API 来补充缺失的订单。
 *
 * 工作原理：
 * 1. 记录每个店铺最后一次同步的时间和订单 ID
 * 2. 定时任务从 Shopify API 拉取指定时间范围内的订单
 * 3. 与本地数据库对比，补充本地缺失的订单
 */
@Injectable()
export class OrderSyncService {
  private readonly logger = new Logger(OrderSyncService.name);

  // 每次最多同步的订单数
  private readonly BATCH_SIZE = 250;

  // 兜底同步时间范围（小时）：只同步最近 N 小时内的订单
  private readonly SYNC_HOURS_LOOKBACK = 24;

  constructor(
    @InjectRepository(SyncRecordEntity)
    private readonly syncRecordRepository: Repository<SyncRecordEntity>,
    private readonly graphqlService: ShopifyGraphqlService,
    private readonly orderService: OrderService,
  ) {}

  /**
   * 同步指定店铺的订单（增量同步）。
   *
   * @param shop 店铺域名
   * @returns 同步的订单数量
   */
  async syncOrders(shop: string): Promise<number> {
    try {
      this.logger.log(`Starting order sync for shop: ${shop}`);

      // 获取上次同步记录
      const record = await this.getSyncRecord(shop, 'orders');
      const lastSyncTime = record?.lastSyncAt
        ? new Date(record.lastSyncAt)
        : new Date(Date.now() - this.SYNC_HOURS_LOOKBACK * 60 * 60 * 1000);

      // 计算时间范围
      const endTime = new Date();
      const startTime = lastSyncTime;

      this.logger.debug(
        `Syncing orders from ${startTime.toISOString()} to ${endTime.toISOString()}`,
      );

      // 从 Shopify API 拉取订单
      const orders = await this.fetchOrdersFromShopify(shop, startTime, endTime);

      if (orders.length === 0) {
        this.logger.debug(`No new orders found for ${shop}`);
        return 0;
      }

      // 过滤出需要同步的订单（创建时间在范围内的）
      const newOrders = orders.filter(
        (order) => new Date(order.createdAt) > lastSyncTime,
      );

      if (newOrders.length === 0) {
        this.logger.debug(`All ${orders.length} orders already synced for ${shop}`);
        return 0;
      }

      // 保存订单到数据库
      let syncedCount = 0;
      for (const order of newOrders) {
        try {
          await this.orderService.saveOrder(shop, order);
          syncedCount++;
        } catch (error: any) {
          this.logger.error(`Failed to save order ${order.id}: ${error.message}`);
        }
      }

      // 更新同步记录
      const latestOrder = newOrders[newOrders.length - 1];
      await this.updateSyncRecord(shop, 'orders', {
        lastSyncAt: new Date(),
        lastSyncId: latestOrder.id,
        lastOrderTime: new Date(latestOrder.createdAt),
        lastSyncCount: syncedCount,
        status: 'idle',
        lastError: null,
      });

      this.logger.log(
        `Order sync completed for ${shop}: ${syncedCount} orders synced`,
      );

      return syncedCount;
    } catch (error: any) {
      this.logger.error(`Order sync failed for ${shop}: ${error.message}`, error.stack);

      // 更新错误状态
      await this.updateSyncRecord(shop, 'orders', {
        status: 'error',
        lastError: error.message,
      });

      return 0;
    }
  }

  /**
   * 同步所有已授权店铺的订单。
   */
  async syncAllShops(): Promise<{ shop: string; synced: number }[]> {
    // TODO: 从 session 表获取所有已授权的店铺
    // 目前需要手动调用或通过事件触发
    this.logger.debug('syncAllShops called but not implemented - no session table access here');
    return [];
  }

  /**
   * 强制全量同步（从指定时间开始）。
   */
  async forceSyncOrders(shop: string, since: Date): Promise<number> {
    try {
      this.logger.log(`Force syncing orders for ${shop} since ${since.toISOString()}`);

      // 重置同步记录
      await this.syncRecordRepository.upsert(
        {
          shop,
          syncType: 'orders',
          lastSyncAt: since,
          status: 'syncing',
        },
        { conflictPaths: ['shop', 'syncType'] },
      );

      return this.syncOrders(shop);
    } catch (error: any) {
      this.logger.error(`Force sync failed for ${shop}: ${error.message}`);
      return 0;
    }
  }

  /**
   * 从 Shopify API 拉取订单。
   */
  private async fetchOrdersFromShopify(
    shop: string,
    startTime: Date,
    endTime: Date,
  ): Promise<any[]> {
    const query = `
      query GetOrders($createdAtMin: DateTime!, $createdAtMax: DateTime!, $first: Int!, $after: String) {
        orders(
          first: $first
          after: $after
          query: "created_at:>=${startTime.toISOString()} AND created_at:<=${endTime.toISOString()}"
        ) {
          edges {
            node {
              id
              name
              createdAt
              updatedAt
              currentTotalPriceSet {
                presentmentMoney { amount currencyCode }
                shopMoney { amount currencyCode }
              }
              subtotalPriceSet {
                presentmentMoney { amount currencyCode }
                shopMoney { amount currencyCode }
              }
              totalShippingPriceSet {
                presentmentMoney { amount currencyCode }
                shopMoney { amount currencyCode }
              }
              totalTaxSet {
                presentmentMoney { amount currencyCode }
                shopMoney { amount currencyCode }
              }
              paymentGatewayNames
              lineItems(first: 100) {
                edges {
                  node {
                    id
                    title
                    quantity
                    sku
                    variant { id title price }
                  }
                }
              }
              shippingAddress {
                firstName lastName address1 address2 city province country zip phone
              }
              billingAddress {
                firstName lastName address1 address2 city province country zip phone
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    const allOrders: any[] = [];
    let hasNextPage = true;
    let after: string | undefined;

    while (hasNextPage && allOrders.length < this.BATCH_SIZE * 4) {
      try {
        const result: any = await this.graphqlService.query(shop, query, {
          createdAtMin: startTime.toISOString(),
          createdAtMax: endTime.toISOString(),
          first: this.BATCH_SIZE,
          after,
        });

        const { edges, pageInfo } = result.orders;
        allOrders.push(...edges.map((e: any) => e.node));
        hasNextPage = pageInfo.hasNextPage;
        after = pageInfo.endCursor;
      } catch (error: any) {
        this.logger.error(`Failed to fetch orders page: ${error.message}`);
        break;
      }
    }

    return allOrders;
  }

  /**
   * 获取同步记录。
   */
  private async getSyncRecord(
    shop: string,
    syncType: string,
  ): Promise<SyncRecordEntity | null> {
    try {
      return await this.syncRecordRepository.findOne({
        where: { shop, syncType },
      });
    } catch (error: any) {
      this.logger.error(`Failed to get sync record: ${error.message}`);
      return null;
    }
  }

  /**
   * 更新同步记录。
   */
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
      this.logger.error(`Failed to update sync record: ${error.message}`);
    }
  }

  /**
   * 获取所有店铺的同步状态。
   */
  async getSyncStatus(): Promise<SyncRecordEntity[]> {
    try {
      return await this.syncRecordRepository.find({
        where: { syncType: 'orders' },
        order: { lastSyncAt: 'DESC' },
      });
    } catch (error: any) {
      this.logger.error(`Failed to get sync status: ${error.message}`);
      return [];
    }
  }
}
