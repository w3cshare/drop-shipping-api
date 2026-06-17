import { Injectable, Logger } from '@nestjs/common';
import { ShopifySessionService } from '../shopify/session/shopify-session.service';

/**
 * Webhook 注册服务
 *
 * 在 OAuth 授权完成后自动向 Shopify 注册 Webhook
 * 使用 Shopify Admin REST API 注册 Webhook
 *
 * 支持的 Webhook Topics:
 * - orders/create, orders/updated, orders/cancelled, orders/fulfilled
 * - products/create, products/update, products/delete
 * - app/uninstalled
 * - customers/data_request, customers/redact, shop/redact (GDPR)
 */
@Injectable()
export class WebhookRegistrationService {
  private readonly logger = new Logger(WebhookRegistrationService.name);

  // 需要注册的 Webhook topics（使用 GraphQL API 格式）
  private readonly webhookTopics = [
    'orders/create',
    'orders/updated',
    'orders/cancelled',
    'orders/fulfilled',
    'products/create',
    'products/update',
    'products/delete',
    'shop/update',
    'app/uninstalled',
  ];

  constructor(private readonly sessionService: ShopifySessionService) {}

  /**
   * 为指定店铺注册所有 Webhook
   *
   * @param shop 店铺域名
   * @param host 应用公网地址（如 https://auth2.s7.tunnelfrp.com）
   */
  async registerWebhooks(shop: string, host: string): Promise<{
    registered: string[];
    failed: string[];
    existing: string[];
  }> {
    const result = {
      registered: [] as string[],
      failed: [] as string[],
      existing: [] as string[],
    };

    const accessToken = await this.sessionService.getOfflineToken(shop);
    if (!accessToken) {
      this.logger.error(`No access token for shop ${shop}, cannot register webhooks`);
      return result;
    }

    // 先获取已注册的 Webhook
    const existingWebhooks = await this.getExistingWebhooks(shop, accessToken);

    for (const topic of this.webhookTopics) {
      const callbackUrl = `${host}/webhooks/${topic.replace('/', '/')}`;

      // 检查是否已存在
      const existing = existingWebhooks.find(
        (w: any) => w.topic === topic && w.address === callbackUrl,
      );

      if (existing) {
        this.logger.debug(`Webhook ${topic} already registered for ${shop}`);
        result.existing.push(topic);
        continue;
      }

      // 注册新的 Webhook
      try {
        await this.createWebhook(shop, accessToken, topic, callbackUrl);
        this.logger.log(`Webhook ${topic} registered for ${shop}`);
        result.registered.push(topic);
      } catch (error: any) {
        this.logger.error(`Failed to register webhook ${topic}: ${error.message}`);
        result.failed.push(topic);
      }
    }

    this.logger.log(
      `Webhook registration complete for ${shop}: ` +
        `${result.registered.length} registered, ` +
        `${result.existing.length} existing, ` +
        `${result.failed.length} failed`,
    );

    return result;
  }

  /**
   * 列出该店铺已注册的所有 Webhook。
   */
  async listWebhooks(shop: string): Promise<any[]> {
    const accessToken = await this.sessionService.getOfflineToken(shop);
    if (!accessToken) {
      this.logger.error(`No access token for shop ${shop}`);
      return [];
    }
    return this.getExistingWebhooks(shop, accessToken);
  }

  /**
   * 获取已注册的 Webhook 列表（使用 REST API）
   */
  private async getExistingWebhooks(shop: string, accessToken: string): Promise<any[]> {
    try {
      const response = await fetch(`https://${shop}/admin/api/2026-04/webhooks.json`, {
        method: 'GET',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Failed to get webhooks: ${response.status} - ${errorText}`);
        return [];
      }

      const data = await response.json() as { webhooks: any[] };
      this.logger.debug(`Found ${data.webhooks?.length || 0} existing webhooks for ${shop}`);
      return data.webhooks || [];
    } catch (error: any) {
      this.logger.error(`Failed to get existing webhooks: ${error.message}`);
      return [];
    }
  }

  /**
   * 创建单个 Webhook（使用 REST API）
   */
  private async createWebhook(
    shop: string,
    accessToken: string,
    topic: string,
    callbackUrl: string,
  ): Promise<any> {
    const response = await fetch(`https://${shop}/admin/api/2026-04/webhooks.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        webhook: {
          topic,
          address: callbackUrl,
          format: 'json',
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json() as { webhook: any };
    return data.webhook;
  }

  /**
   * 删除所有 Webhook（用于清理）
   */
  async deleteAllWebhooks(shop: string): Promise<boolean> {
    const accessToken = await this.sessionService.getOfflineToken(shop);
    if (!accessToken) {
      return false;
    }

    const existingWebhooks = await this.getExistingWebhooks(shop, accessToken);

    for (const webhook of existingWebhooks) {
      try {
        await this.deleteWebhook(shop, accessToken, webhook.id);
        this.logger.log(`Deleted webhook ${webhook.topic} for ${shop}`);
      } catch (error: any) {
        this.logger.error(`Failed to delete webhook ${webhook.id}: ${error.message}`);
      }
    }

    return true;
  }

  private async deleteWebhook(shop: string, accessToken: string, webhookId: number): Promise<void> {
    const response = await fetch(`https://${shop}/admin/api/2026-04/webhooks/${webhookId}.json`, {
      method: 'DELETE',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok && response.status !== 404) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
  }
}
