import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseSyncService } from './base-sync.service';
import { SyncRecordEntity } from '../database/entities/sync-record.entity';
import { ShopifySessionService } from '../shopify/session/shopify-session.service';
import { OrderService } from '../orders/order.service';
import axios from 'axios';

/**
 * 订单同步服务（三层补偿机制第三层）
 *
 * 继承 BaseSyncService，只实现订单特有的三个方法：
 * - getLocalCount: 本地订单数
 * - saveItem: 保存单条订单
 * - fetchFromShopify: 从 Shopify REST API 分页拉取订单（带重试）
 */
@Injectable()
export class OrderSyncService extends BaseSyncService {
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY_MS = [1000, 2000, 4000];

  constructor(
    protected readonly sessionService: ShopifySessionService,
    @InjectRepository(SyncRecordEntity)
    protected readonly syncRecordRepository: Repository<SyncRecordEntity>,
    private readonly orderService: OrderService,
  ) {
    super(sessionService, syncRecordRepository, 'orders');
  }

  // 保留对外方法名，内部委托基类
  async syncOrders(shop: string): Promise<number> {
    return this.sync(shop);
  }

  async forceSyncOrders(shop: string, since: Date): Promise<number> {
    return this.forceSync(shop, since);
  }

  // ---------------- 基类抽象方法实现 ----------------

  protected async getLocalCount(shop: string): Promise<number> {
    return this.orderService.getOrderCount(shop);
  }

  protected async saveItem(shop: string, item: any): Promise<any> {
    return this.orderService.saveOrder(shop, item);
  }

  protected async fetchFromShopify(
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

  // ---------------- 订单特有：带重试的 REST 请求 ----------------

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
}
