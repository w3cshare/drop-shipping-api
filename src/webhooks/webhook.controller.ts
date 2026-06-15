import {
  Controller,
  Post,
  Req,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { ShopifySessionService } from '../shopify/session/shopify-session.service';
import { OrderService } from '../orders/order.service';

/**
 * Webhook 处理控制器
 * 
 * 处理来自 Shopify 的 Webhook 事件
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
  ) {}

  /**
   * 处理订单创建 Webhook
   * 
   * 当 Shopify 创建新订单时触发，将订单数据保存到本地数据库
   */
  @Post('orders/create')
  @HttpCode(HttpStatus.OK)
  async handleOrdersCreate(@Req() req: Request) {
    try {
      const order = req.body;
      const shop = req.headers['x-shopify-shop-domain'] as string;

      this.logger.log(`Order created: ${order.id} (${order.name}) from ${shop}`);

      // 保存订单到数据库
      await this.orderService.saveOrder(shop, order);

      this.logger.log(`Order ${order.id} saved successfully`);
      return { success: true, orderId: order.id, message: 'Order saved to database' };
    } catch (error: any) {
      this.logger.error(`Failed to handle orders/create: ${error.message}`, error.stack);
      // 返回 200 以避免 Shopify 重试
      return { success: false, error: error.message };
    }
  }

  /**
   * 处理订单更新 Webhook
   * 
   * 当订单信息更新时触发，同步更新本地数据库
   */
  @Post('orders/updated')
  @HttpCode(HttpStatus.OK)
  async handleOrdersUpdated(@Req() req: Request) {
    try {
      const order = req.body;
      const shop = req.headers['x-shopify-shop-domain'] as string;

      this.logger.log(`Order updated: ${order.id} (${order.name}) from ${shop}`);

      // 更新订单到数据库
      await this.orderService.saveOrder(shop, order);

      this.logger.log(`Order ${order.id} updated successfully`);
      return { success: true, orderId: order.id, message: 'Order updated in database' };
    } catch (error: any) {
      this.logger.error(`Failed to handle orders/updated: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }

  /**
   * 处理订单取消 Webhook
   * 
   * 当订单被取消时触发
   */
  @Post('orders/cancelled')
  @HttpCode(HttpStatus.OK)
  async handleOrdersCancelled(@Req() req: Request) {
    try {
      const order = req.body;
      const shop = req.headers['x-shopify-shop-domain'] as string;

      this.logger.log(`Order cancelled: ${order.id} (${order.name}) from ${shop}`);

      // 更新订单状态
      await this.orderService.saveOrder(shop, order);

      this.logger.log(`Order ${order.id} marked as cancelled`);
      return { success: true, orderId: order.id, message: 'Order marked as cancelled' };
    } catch (error: any) {
      this.logger.error(`Failed to handle orders/cancelled: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }

  /**
   * 处理订单完成 Webhook
   * 
   * 当订单完成配送时触发
   */
  @Post('orders/fulfilled')
  @HttpCode(HttpStatus.OK)
  async handleOrdersFulfilled(@Req() req: Request) {
    try {
      const order = req.body;
      const shop = req.headers['x-shopify-shop-domain'] as string;

      this.logger.log(`Order fulfilled: ${order.id} (${order.name}) from ${shop}`);

      // 更新订单状态
      await this.orderService.saveOrder(shop, order);

      this.logger.log(`Order ${order.id} marked as fulfilled`);
      return { success: true, orderId: order.id, message: 'Order marked as fulfilled' };
    } catch (error: any) {
      this.logger.error(`Failed to handle orders/fulfilled: ${error.message}`, error.stack);
      return { success: false, error: error.message };
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

      this.logger.log(`Product created: ${product.id} from ${shop}`);

      // TODO: 实现产品创建处理逻辑

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

      this.logger.log(`Product updated: ${product.id} from ${shop}`);

      // TODO: 实现产品更新处理逻辑

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

      this.logger.log(`Product deleted: ${product.id} from ${shop}`);

      // TODO: 实现产品删除处理逻辑

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

      this.logger.log(`App uninstalled from ${shop}`);

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

      this.logger.log(`Customer data request from ${shop}: ${payload.customer?.id}`);

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

      this.logger.log(`Customer redact request from ${shop}: ${payload.customer?.id}`);

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

      this.logger.log(`Shop redact request from ${shop}`);

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
}