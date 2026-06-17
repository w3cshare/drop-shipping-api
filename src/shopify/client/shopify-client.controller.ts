import {
  Controller,
  Get,
  Query,
  UseGuards,
  Req,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { ShopifyAuthGuard } from '../auth/auth.guard';
import { ShopifyClientService } from './shopify-client.service';

/**
 * REST API 测试控制器
 *
 * 使用 ShopifyClientService 调用 Shopify REST Admin API
 * 用于测试和对比 REST API 与 GraphQL API 的返回结果
 *
 * 需要通过 @UseGuards(ShopifyAuthGuard) 验证授权
 */
@Controller('api2/shopify')
@UseGuards(ShopifyAuthGuard)
export class ShopifyClientController {
  private readonly logger = new Logger(ShopifyClientController.name);

  constructor(private readonly clientService: ShopifyClientService) {}

  /**
   * 获取产品列表（REST）
   */
  @Get('products')
  async getProducts(
    @Req() req: Request,
    @Query('limit') limit: string = '50',
  ) {
    try {
      const shopify = (req as any).shopify;
      const shop = shopify.shop;

      this.logger.log(`[REST] Fetching products for shop: ${shop}`);

      const result = await this.clientService.getProductsRest(shop, parseInt(limit, 10)) as any;

      // REST API 返回结构: { body: { products: [...] }, ... }
      const products = result?.body?.products || result?.products || [];

      return {
        success: true,
        api: 'REST',
        shop,
        count: Array.isArray(products) ? products.length : 0,
        data: result,
      };
    } catch (error: any) {
      this.logger.error(`[REST] Failed to fetch products: ${error.message}`, error.stack);
      return {
        success: false,
        api: 'REST',
        error: error.message,
      };
    }
  }

  /**
   * 获取订单列表（REST）
   */
  @Get('orders')
  async getOrders(
    @Req() req: Request,
    @Query('limit') limit: string = '50',
  ) {
    try {
      const shopify = (req as any).shopify;
      const shop = shopify.shop;

      this.logger.log(`[REST] Fetching orders for shop: ${shop}`);

      const result = await this.clientService.getOrdersRest(shop, parseInt(limit, 10)) as any;

      // REST API 返回结构: { body: { orders: [...] }, ... }
      const orders = result?.body?.orders || result?.orders || [];

      return {
        success: true,
        api: 'REST',
        shop,
        count: Array.isArray(orders) ? orders.length : 0,
        data: orders,
      };
    } catch (error: any) {
      this.logger.error(`[REST] Failed to fetch orders: ${error.message}`, error.stack);
      return {
        success: false,
        api: 'REST',
        error: error.message,
      };
    }
  }

  /**
   * 获取客户列表（REST）
   */
  @Get('customers')
  async getCustomers(
    @Req() req: Request,
    @Query('limit') limit: string = '50',
  ) {
    try {
      const shopify = (req as any).shopify;
      const shop = shopify.shop;

      this.logger.log(`[REST] Fetching customers for shop: ${shop}`);

      const result = await this.clientService.getCustomersRest(shop, parseInt(limit, 10)) as any;

      // REST API 返回结构: { body: { customers: [...] }, ... }
      const customers = result?.body?.customers || result?.customers || [];

      return {
        success: true,
        api: 'REST',
        shop,
        count: Array.isArray(customers) ? customers.length : 0,
        data: result,
      };
    } catch (error: any) {
      this.logger.error(`[REST] Failed to fetch customers: ${error.message}`, error.stack);
      return {
        success: false,
        api: 'REST',
        error: error.message,
      };
    }
  }

  /**
   * 获取 Webhook 列表（REST）
   */
  @Get('webhooks')
  async getWebhooks(@Req() req: Request) {
    try {
      const shopify = (req as any).shopify;
      const shop = shopify.shop;

      this.logger.log(`[REST] Fetching webhooks for shop: ${shop}`);

      const result = await this.clientService.getWebhooks(shop) as any;

      // REST API 返回结构: { body: { webhooks: [...] }, ... }
      const webhooks = result?.body?.webhooks || result?.webhooks || [];

      return {
        success: true,
        api: 'REST',
        shop,
        count: Array.isArray(webhooks) ? webhooks.length : 0,
        data: result,
      };
    } catch (error: any) {
      this.logger.error(`[REST] Failed to fetch webhooks: ${error.message}`, error.stack);
      return {
        success: false,
        api: 'REST',
        error: error.message,
      };
    }
  }

  /**
   * 通用 REST 请求测试
   * 支持自定义端点和 HTTP 方法
   */
  @Get('request')
  async customRequest(
    @Req() req: Request,
    @Query('endpoint') endpoint: string,
    @Query('method') method: string = 'GET',
  ) {
    try {
      const shopify = (req as any).shopify;
      const shop = shopify.shop;

      if (!endpoint) {
        return {
          success: false,
          error: 'endpoint query parameter is required',
        };
      }

      const httpMethod = method.toUpperCase() as 'GET' | 'POST' | 'PUT' | 'DELETE';

      this.logger.log(`[REST] Custom ${httpMethod} request to ${endpoint} for shop: ${shop}`);

      const result = await this.clientService.adminApiRequest(shop, endpoint, httpMethod);

      return {
        success: true,
        api: 'REST',
        shop,
        method: httpMethod,
        endpoint,
        data: result,
      };
    } catch (error: any) {
      this.logger.error(`[REST] Custom request failed: ${error.message}`, error.stack);
      return {
        success: false,
        api: 'REST',
        error: error.message,
      };
    }
  }
}
