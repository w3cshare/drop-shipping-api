import { Injectable, Logger } from '@nestjs/common';
import { ShopifyModule } from '../shopify.module';
import { ShopifySessionService } from '../session/shopify-session.service';

/**
 * Shopify REST Admin API 客户端服务。
 *
 * 使用官方 @shopify/shopify-api 的 shopify.clients.Rest。
 */
@Injectable()
export class ShopifyClientService {
  private readonly logger = new Logger(ShopifyClientService.name);

  constructor(private readonly sessionService: ShopifySessionService) {}

  /**
   * 构建一个 fake session 用于 REST 客户端（shopify-api 要求 session 对象）。
   */
  private makeSession(shop: string, accessToken: string): any {
    return { shop, accessToken, isOnline: false, state: 'state' };
  }

  /**
   * 通用 REST 请求。
   */
  async adminApiRequest<T = any>(
    shop: string,
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    data?: Record<string, any>,
  ): Promise<T> {
    try {
      const accessToken = await this.sessionService.getOfflineToken(shop);
      if (!accessToken) {
        throw new Error(`No access token found for shop: ${shop}`);
      }

      const shopify = ShopifyModule.shopify;
      const client = new shopify.clients.Rest({ session: this.makeSession(shop, accessToken) });

      let result: any;
      const path = endpoint.replace(/\.json$/, '');
      if (method === 'GET') {
        result = await (client as any).get({ path, query: data ?? {} });
      } else if (method === 'POST') {
        result = await (client as any).post({ path, body: data ?? {} });
      } else if (method === 'PUT') {
        result = await (client as any).put({ path, body: data ?? {} });
      } else if (method === 'DELETE') {
        result = await (client as any).delete({ path });
      }

      return result as T;
    } catch (error: any) {
      this.logger.error(
        `Admin API [${method}] ${endpoint} failed for shop ${shop}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /** 获取产品列表（REST） */
  async getProductsRest(shop: string, limit: number = 50): Promise<any[]> {
    return this.adminApiRequest<any[]>(shop, `products.json?limit=${limit}`, 'GET');
  }

  /** 获取订单列表（REST） */
  async getOrdersRest(shop: string, limit: number = 50): Promise<any[]> {
    return this.adminApiRequest<any[]>(shop, `orders.json?limit=${limit}`, 'GET');
  }

  /** 获取客户列表（REST） */
  async getCustomersRest(shop: string, limit: number = 50): Promise<any[]> {
    return this.adminApiRequest<any[]>(shop, `customers.json?limit=${limit}`, 'GET');
  }

  /** 创建 Webhook */
  async createWebhook(
    shop: string,
    topic: string,
    address: string,
  ): Promise<any> {
    return this.adminApiRequest<any>(shop, 'webhooks.json', 'POST', {
      webhook: { topic, address, format: 'json' },
    });
  }

  /** 获取 Webhook 列表 */
  async getWebhooks(shop: string): Promise<any[]> {
    return this.adminApiRequest<any[]>(shop, 'webhooks.json', 'GET');
  }

  /** 删除 Webhook */
  async deleteWebhook(shop: string, webhookId: number): Promise<void> {
    await this.adminApiRequest<void>(shop, `webhooks/${webhookId}.json`, 'DELETE');
  }

  /**
   * 使用 shopify-api 的 webhooks.validate 验证 webhook 请求签名。
   * 注意：validate 方法接受原始请求与 hmac header，返回验证结果。
   */
  async validateWebhookRequest(
    rawBody: string | Buffer,
    hmacHeader: string | undefined,
    webhookId?: string,
  ): Promise<boolean> {
    try {
      if (!hmacHeader) return false;
      const shopify = ShopifyModule.shopify;
      // shopify-api v11 提供 webhooks.validate
      const validationResult = await shopify.webhooks.validate({
        rawBody,
        hmac: hmacHeader,
        ...(webhookId ? { webhookId } : {}),
      } as any);
      return validationResult?.valid ?? false;
    } catch (error: any) {
      this.logger.warn(`Webhook validation error: ${error.message}`);
      return false;
    }
  }
}
