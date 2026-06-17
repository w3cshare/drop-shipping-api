import { Controller, Get, Query, Param, UseGuards, Req, Logger } from '@nestjs/common';
import { Request } from 'express';
import { ShopifyAuthGuard } from '../shopify/auth/auth.guard';
import { OrderService } from './order.service';
import { OrderFiltersDto } from './order.dto';
import { ShopService } from '../shop/shop.service';

/**
 * 订单管理接口（直接从数据库读取）
 *
 * 路由前缀：/admin/api
 * 鉴权：    ShopifyAuthGuard（通过 ?shop=xxx 或 Bearer token 绑定店铺上下文）
 *
 * 接口：
 *   GET /admin/api/orders           订单列表（分页 + 过滤）
 *   GET /admin/api/orders/:id       订单详情
 *   GET /admin/api/orders/stats     订单统计
 */
@Controller('api/admin')
@UseGuards(ShopifyAuthGuard)
export class OrdersController {
  private readonly logger = new Logger(OrdersController.name);

  constructor(
    private readonly orderService: OrderService,
    private readonly shopService: ShopService,
  ) {}

  /**
   * 订单列表（从数据库直读）
   */
  @Get('orders')
  async getOrders(
    @Req() req: Request,
    @Query('page') page: string = '1',
    @Query('page_size') pageSize: string = '20',
    @Query('status') status?: string,
    @Query('financial_status') financialStatus?: string,
    @Query('fulfillment_status') fulfillmentStatus?: string,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
    @Query('keyword') keyword?: string,
  ) {
    try {
      const shop = (req as any).shopify?.shop as string;
      this.logger.log(`[admin] Fetching orders from DB for shop: ${shop}`);

      const filters: OrderFiltersDto = {};
      if (status) filters.status = status;
      if (financialStatus) filters.financialStatus = financialStatus;
      if (fulfillmentStatus) filters.fulfillmentStatus = fulfillmentStatus;
      if (startDate) filters.startDate = new Date(startDate);
      if (endDate) filters.endDate = new Date(endDate);
      if (keyword) filters.keyword = keyword;

      const result = await this.orderService.findOrdersWithPagination(
        shop,
        parseInt(page, 10) || 1,
        parseInt(pageSize, 10) || 20,
        filters,
      );

      // 读取店铺信息，统一附加到每条订单
      const shopEntity = await this.shopService.getByShop(shop);
      const shopInfo = shopEntity
        ? {
            name: shopEntity.name,
            email: shopEntity.email,
            domain: shopEntity.domain,
            currency_code: shopEntity.currencyCode,
            country_code: shopEntity.countryCode,
          }
        : null;

      const items = result.items.map((item) =>
        this.orderService.toResponseDto(item as any, shopInfo),
      );
      const totalPages = Math.ceil(result.total / (parseInt(pageSize, 10) || 20));

      return {
        success: true,
        shop,
        data: items,
        pagination: {
          page: result.page,
          page_size: result.pageSize,
          total: result.total,
          total_pages: totalPages,
          has_next: result.page < totalPages,
          has_prev: result.page > 1,
        },
      };
    } catch (error: any) {
      this.logger.error(`[admin] Failed to fetch orders: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }

  /**
   * 订单详情
   */
  @Get('orders/:id')
  async getOrderDetail(@Req() req: Request, @Param('id') orderId: string) {
    try {
      const shop = (req as any).shopify?.shop as string;
      if (!orderId) {
        return { success: false, error: 'Order ID is required' };
      }

      const order = await this.orderService.findOrderById(shop, orderId);
      if (!order) {
        return { success: false, error: 'Order not found' };
      }

      const shopEntity = await this.shopService.getByShop(shop);
      const shopInfo = shopEntity
        ? {
            name: shopEntity.name,
            email: shopEntity.email,
            domain: shopEntity.domain,
            currency_code: shopEntity.currencyCode,
            country_code: shopEntity.countryCode,
          }
        : null;

      return {
        success: true,
        shop,
        data: this.orderService.toResponseDto(order, shopInfo),
      };
    } catch (error: any) {
      this.logger.error(`[admin] Failed to fetch order detail: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }

  /**
   * 订单统计（总数、总金额、按状态分组）
   */
  @Get('orders/stats')
  async getStats(
    @Req() req: Request,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
  ) {
    try {
      const shop = (req as any).shopify?.shop as string;
      const filters: any = {};
      if (startDate) filters.startDate = new Date(startDate);
      if (endDate) filters.endDate = new Date(endDate);

      const stats = await this.orderService.getOrderStats(shop, filters);

      const shopEntity = await this.shopService.getByShop(shop);
      const shopInfo = shopEntity
        ? {
            shop,
            name: shopEntity.name,
            currency_code: shopEntity.currencyCode,
          }
        : { shop, name: null, currency_code: null };

      return {
        success: true,
        shop: shopInfo,
        data: stats,
      };
    } catch (error: any) {
      this.logger.error(`[admin] Failed to fetch order stats: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }
}
