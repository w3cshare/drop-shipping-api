import { Injectable, Logger } from '@nestjs/common';
import { ShopifyModule } from '../shopify.module';
import { ShopifySessionService } from '../session/shopify-session.service';

/**
 * Shopify REST Admin API 客户端服务。
 *
 * 使用官方 @shopify/shopify-api 的 shopify.clients.Rest。
 *
 * Token 自动刷新机制：
 * - 请求失败 401/403 时，自动刷新 token 并重试一次
 */
@Injectable()
export class ShopifyClientService {
  private readonly logger = new Logger(ShopifyClientService.name);

  constructor(private readonly sessionService: ShopifySessionService) {}

  /**
   * 构建一个 fake session 用于 REST 客户端。
   */
  private makeSession(shop: string, accessToken: string): any {
    return { shop, accessToken, isOnline: false, state: 'state' };
  }

  /**
   * 通用 REST 请求，支持 token 过期自动刷新重试。
   *
   * @param shop 店铺域名
   * @param endpoint API 路径（不含 .json 后缀）
   * @param method HTTP 方法
   * @param data 请求数据（POST/PUT）或查询参数（GET）
   * @param _retryAttempt 内部使用：当前重试次数（默认 0）
   */
  async adminApiRequest<T = any>(
    shop: string,
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    data?: Record<string, any>,
    _retryAttempt: number = 0
  ): Promise<T> {
    try {
      const accessToken = await this.sessionService.getOfflineToken(shop);
      if (!accessToken) {
        throw new Error(`No access token found for shop: ${shop}`);
      }

      const shopify = ShopifyModule.shopify;
      const client = new shopify.clients.Rest({
        session: this.makeSession(shop, accessToken),
      });

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
      // 检测是否为 401/403 token 过期错误
      const isAuthError = this.isAuthError(error);

      if (isAuthError && _retryAttempt === 0) {
        this.logger.warn(
          `REST [${method}] ${endpoint} returned ${this.getErrorStatus(error)} for ${shop}, ` +
            `attempting token refresh and retry...`
        );

        // 强制刷新 token
        const newToken = await this.sessionService.refreshOfflineToken(shop);

        if (newToken) {
          this.logger.log(`Token refreshed for ${shop}, retrying [${method}] ${endpoint}...`);
          // 用新 token 重试一次
          return this.adminApiRequest<T>(shop, endpoint, method, data, _retryAttempt + 1);
        }

        this.logger.error(`Token refresh failed for ${shop}, cannot retry`);
      }

      this.logger.error(
        `Admin API [${method}] ${endpoint} failed for shop ${shop}: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * 判断错误是否为认证失败（401/403）。
   */
  private isAuthError(error: any): boolean {
    const status = this.getErrorStatus(error);
    if (status === 401 || status === 403) return true;

    const msg = (error?.message || '').toLowerCase();
    if (msg.includes('unauthorized') || msg.includes('forbidden') ||
        msg.includes('invalid access token') || msg.includes('token expired')) {
      return true;
    }

    return false;
  }

  /**
   * 从错误对象中提取 HTTP 状态码。
   */
  private getErrorStatus(error: any): number | null {
    if (error?.status) return error.status;
    if (error?.statusCode) return error.statusCode;
    if (error?.response?.status) return error.response.status;
    if (error?.code) {
      const code = String(error.code);
      const match = code.match(/(\d{3})/);
      if (match) return parseInt(match[1], 10);
    }
    return null;
  }

  /** 获取产品列表（REST） */
  async getProductsRest(shop: string, limit: number = 50): Promise<any> {
    return this.adminApiRequest<any>(shop, 'products.json', 'GET', { limit });
  }

  /** 获取订单列表（REST） */
  async getOrdersRest(shop: string, limit: number = 50): Promise<any> {
    return this.adminApiRequest<any>(shop, 'orders.json', 'GET', { limit });
  }

  /** 获取客户列表（REST） */
  async getCustomersRest(shop: string, limit: number = 50): Promise<any> {
    return this.adminApiRequest<any>(shop, 'customers.json', 'GET', { limit });
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
  async getWebhooks(shop: string): Promise<any> {
    return this.adminApiRequest<any>(shop, 'webhooks.json', 'GET');
  }

  /** 删除 Webhook */
  async deleteWebhook(shop: string, webhookId: number): Promise<void> {
    await this.adminApiRequest<void>(shop, `webhooks/${webhookId}.json`, 'DELETE');
  }

  /**
   * 使用 shopify-api 的 webhooks.validate 验证 webhook 请求签名。
   */
  async validateWebhookRequest(
    rawBody: string | Buffer,
    hmacHeader: string | undefined,
    webhookId?: string,
  ): Promise<boolean> {
    try {
      if (!hmacHeader) return false;
      const shopify = ShopifyModule.shopify;
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
