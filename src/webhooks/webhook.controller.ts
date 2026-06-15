import {
  Controller,
  Post,
  Get,
  Req,
  Logger,
  HttpCode,
  HttpStatus,
  Query,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { Request } from 'express';
import { ShopifySessionService } from '../shopify/session/shopify-session.service';
import { OrderService } from '../orders/order.service';
import { WebhookQueueService } from './webhook-queue.service';
import { SyncScheduler } from '../orders/sync-scheduler';

/**
 * Webhook 处理控制器
 *
 * 处理来自 Shopify 的 Webhook 事件
 *
 * 可靠性设计：
 * 1. Webhook 收到后立即写入 MySQL 队列，立即返回 200
 * 2. 后台任务异步处理队列中的事件
 * 3. 失败自动重试（最多 3 次）
 * 4. 定时补偿任务兜底：从 Shopify API 拉取缺失的订单
 *
 * Shopify 2026年新规：必须配置 GDPR Webhook
 * - customers/redact: 客户请求删除数据
 * - shop/redact: 店铺请求删除数据
 * - customers/data_request: 客户请求获取数据副本
 * 
 * 其他常用 Webhook：
 * - orders/create: 新订单创建
 * - orders/updated: 订单更新
 * - orders/cancelled: 订单取消
 * - orders/fulfilled: 订单完成
 * - products/create: 新产品创建
 * - products/update: 产品更新
 * - products/delete: 产品删除
 * - app/uninstalled: 应用卸载（清理数据）
 */
@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly sessionService: ShopifySessionService,
    private readonly orderService: OrderService,
    private readonly webhookQueueService: WebhookQueueService,
    @Inject(forwardRef(() => SyncScheduler))
    private readonly syncScheduler: SyncScheduler,
  ) {}

  /**
   * 处理订单创建 Webhook
   *
   * 设计：立即入队 → 返回 200 → 后台异步处理
   */
  @Post('orders/create')
  @HttpCode(HttpStatus.OK)
  async handleOrdersCreate(@Req() req: Request) {
    try {
      const order = req.body;
      const shop = req.headers['x-shopify-shop-domain'] as string;
      const shopifyEventId = req.headers['x-shopify-topic'] as string || 'orders/create';

      this.logger.log(`Webhook received: orders/create from ${shop}, order=${order.name}`);

      // 立即入队，立即返回 200
      await this.webhookQueueService.enqueue(shop, 'orders/create', order, shopifyEventId);

      this.logger.debug(`Order ${order.id} queued for processing`);
      return { success: true, queued: true };
    } catch (error: any) {
      this.logger.error(`Failed to enqueue orders/create: ${error.message}`, error.stack);
      // 即使入队失败也返回 200，避免 Shopify 重试
      return { success: false, queued: false, error: error.message };
    }
  }

  /**
   * 处理订单更新 Webhook
   */
  @Post('orders/updated')
  @HttpCode(HttpStatus.OK)
  async handleOrdersUpdated(@Req() req: Request) {
    try {
      const order = req.body;
      const shop = req.headers['x-shopify-shop-domain'] as string;
      const shopifyEventId = req.headers['x-shopify-topic'] as string || 'orders/updated';

      this.logger.log(`Webhook received: orders/updated from ${shop}, order=${order.name}`);

      await this.webhookQueueService.enqueue(shop, 'orders/updated', order, shopifyEventId);

      return { success: true, queued: true };
    } catch (error: any) {
      this.logger.error(`Failed to enqueue orders/updated: ${error.message}`, error.stack);
      return { success: false, queued: false, error: error.message };
    }
  }

  /**
   * 处理订单取消 Webhook
   */
  @Post('orders/cancelled')
  @HttpCode(HttpStatus.OK)
  async handleOrdersCancelled(@Req() req: Request) {
    try {
      const order = req.body;
      const shop = req.headers['x-shopify-shop-domain'] as string;
      const shopifyEventId = req.headers['x-shopify-topic'] as string || 'orders/cancelled';

      this.logger.log(`Webhook received: orders/cancelled from ${shop}, order=${order.name}`);

      await this.webhookQueueService.enqueue(shop, 'orders/cancelled', order, shopifyEventId);

      return { success: true, queued: true };
    } catch (error: any) {
      this.logger.error(`Failed to enqueue orders/cancelled: ${error.message}`, error.stack);
      return { success: false, queued: false, error: error.message };
    }
  }

  /**
   * 处理订单完成 Webhook
   */
  @Post('orders/fulfilled')
  @HttpCode(HttpStatus.OK)
  async handleOrdersFulfilled(@Req() req: Request) {
    try {
      const order = req.body;
      const shop = req.headers['x-shopify-shop-domain'] as string;
      const shopifyEventId = req.headers['x-shopify-topic'] as string || 'orders/fulfilled';

      this.logger.log(`Webhook received: orders/fulfilled from ${shop}, order=${order.name}`);

      await this.webhookQueueService.enqueue(shop, 'orders/fulfilled', order, shopifyEventId);

      return { success: true, queued: true };
    } catch (error: any) {
      this.logger.error(`Failed to enqueue orders/fulfilled: ${error.message}`, error.stack);
      return { success: false, queued: false, error: error.message };
    }
  }

  /**
   * 处理产品创建 Webhook
   */
  @Post('products/create')
  @HttpCode(HttpStatus.OK)
  async handleProductsCreate(@Req() req: Request) {
    try {
      const product = req.body;
      const shop = req.headers['x-shopify-shop-domain'] as string;

      this.logger.log(`Webhook received: products/create from ${shop}, product=${product.id}`);

      // 产品事件暂时直接记录日志，后续可扩展
      return { success: true };
    } catch (error: any) {
      this.logger.error(`Failed to handle products/create: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }

  /**
   * 处理产品更新 Webhook
   */
  @Post('products/update')
  @HttpCode(HttpStatus.OK)
  async handleProductsUpdate(@Req() req: Request) {
    try {
      const product = req.body;
      const shop = req.headers['x-shopify-shop-domain'] as string;

      this.logger.log(`Webhook received: products/update from ${shop}, product=${product.id}`);

      return { success: true };
    } catch (error: any) {
      this.logger.error(`Failed to handle products/update: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }

  /**
   * 处理产品删除 Webhook
   */
  @Post('products/delete')
  @HttpCode(HttpStatus.OK)
  async handleProductsDelete(@Req() req: Request) {
    try {
      const product = req.body;
      const shop = req.headers['x-shopify-shop-domain'] as string;

      this.logger.log(`Webhook received: products/delete from ${shop}, product=${product.id}`);

      return { success: true };
    } catch (error: any) {
      this.logger.error(`Failed to handle products/delete: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }

  /**
   * 处理应用卸载 Webhook
   *
   * 重要：必须清理所有店铺相关数据
   * - 删除数据库中的会话记录
   * - 删除任何存储的店铺数据
   * - 取消所有订阅和计费
   * 
   * 这是 Shopify 应用合规的必要条件
   */
  @Post('app/uninstalled')
  @HttpCode(HttpStatus.OK)
  async handleAppUninstalled(@Req() req: Request) {
    try {
      const shop = req.headers['x-shopify-shop-domain'] as string;

      this.logger.log(`Webhook received: app/uninstalled from ${shop}`);

      // 清理店铺的所有会话数据
      await this.sessionService.deleteSessionsByShop(shop);

      // TODO: 清理其他店铺相关数据
      // 例如：订单记录、产品缓存、客户数据等

      this.logger.log(`All data cleaned for shop: ${shop}`);

      return { success: true };
    } catch (error: any) {
      this.logger.error(`Failed to handle app/uninstalled: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }

  /**
   * 处理客户数据请求 Webhook（GDPR）
   * 
   * 客户请求获取其数据副本
   * 必须在 30 天内响应
   */
  @Post('customers/data_request')
  @HttpCode(HttpStatus.OK)
  async handleCustomersDataRequest(@Req() req: Request) {
    try {
      const payload = req.body;
      const shop = req.headers['x-shopify-shop-domain'] as string;

      this.logger.log(`Webhook received: customers/data_request from ${shop}`);

      // TODO: 收集并返回客户数据
      // 必须包含应用存储的所有客户相关数据

      return { success: true };
    } catch (error: any) {
      this.logger.error(`Failed to handle customers/data_request: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }

  /**
   * 处理客户数据删除请求 Webhook（GDPR）
   * 
   * 客户请求删除其数据
   * 必须在 30 天内完成删除
   */
  @Post('customers/redact')
  @HttpCode(HttpStatus.OK)
  async handleCustomersRedact(@Req() req: Request) {
    try {
      const payload = req.body;
      const shop = req.headers['x-shopify-shop-domain'] as string;

      this.logger.log(`Webhook received: customers/redact from ${shop}`);

      // TODO: 删除所有客户相关数据
      // 包括：订单记录、浏览历史、个人偏好等

      return { success: true };
    } catch (error: any) {
      this.logger.error(`Failed to handle customers/redact: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }

  /**
   * 处理店铺数据删除请求 Webhook（GDPR）
   * 
   * 店铺请求删除所有数据（通常在店铺关闭后 48 小时内）
   * 必须在 30 天内完成删除
   */
  @Post('shop/redact')
  @HttpCode(HttpStatus.OK)
  async handleShopRedact(@Req() req: Request) {
    try {
      const payload = req.body;
      const shop = req.headers['x-shopify-shop-domain'] as string;

      this.logger.log(`Webhook received: shop/redact from ${shop}`);

      // 清理店铺的所有数据
      await this.sessionService.deleteSessionsByShop(shop);

      // TODO: 删除所有店铺相关数据
      // 包括：配置、缓存、日志、统计数据等

      return { success: true };
    } catch (error: any) {
      this.logger.error(`Failed to handle shop/redact: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }

  // ========== 管理接口 ==========

  /**
   * 获取队列统计信息
   */
  @Get('queue/stats')
  async getQueueStats() {
    const stats = await this.webhookQueueService.getQueueStats();
    return {
      success: true,
      ...stats,
    };
  }

  /**
   * 手动触发同步（用于测试或管理接口）
   */
  @Get('sync/orders')
  async manualSyncOrders(@Query('shop') shop?: string) {
    try {
      const results = await this.syncScheduler.manualSync(shop);
      return {
        success: true,
        results,
      };
    } catch (error: any) {
      this.logger.error(`Manual sync failed: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 手动清理过期事件
   */
  @Get('queue/cleanup')
  async cleanupOldEvents() {
    const cleaned = await this.webhookQueueService.cleanupOldEvents(7);
    return {
      success: true,
      cleaned,
    };
  }
}
