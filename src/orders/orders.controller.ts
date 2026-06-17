import { Controller, Get, Query, Param, UseGuards, Req, Logger, Post } from '@nestjs/common';
import { Request } from 'express';
import { ShopifyAuthGuard } from '../shopify/auth/auth.guard';
import { OrderService } from './order.service';
import { OrderFiltersDto } from './order.dto';
import { SyncScheduler } from './sync-scheduler';

/**
 * 订单管理接口（直接从数据库 b_3rd_orders 读取）
 *
 * 路由前缀：/admin/api
 * 鉴权：    ShopifyAuthGuard（通过 ?shop=xxx 或 Bearer token 绑定店铺上下文）
 *
 * 接口：
 *   GET /admin/api/orders          订单列表（分页 + 过滤）
 *   GET /admin/api/orders/:id      订单详情
 *   GET /admin/api/orders/stats    订单统计
 */
@Controller('api/admin')
@UseGuards(ShopifyAuthGuard)
export class OrdersController {
  private readonly logger = new Logger(OrdersController.name);

  constructor(
    private readonly orderService: OrderService,
    private readonly syncScheduler: SyncScheduler,
  ) {}

  /**
   * 订单列表（从数据库直读）
   *
   * @param page       页码，默认 1
   * @param page_size  每页数量，默认 20，最大 100
   * @param status     按订单状态过滤：open / closed / cancelled / archived 等
   * @param financial_status  按财务状态过滤：pending / authorized / paid / refunded 等
   * @param fulfillment_status 按配送状态过滤：fulfilled / partial / unfulfilled / restocked 等
   * @param start_date 起始日期（YYYY-MM-DD），按订单 created_at 过滤
   * @param end_date   结束日期
   * @param keyword    关键词搜索（匹配订单 name / 订单 ID）
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

      const { items, total, page: curPage, pageSize: curPageSize } =
        await this.orderService.findOrdersWithPagination(
          shop,
          parseInt(page, 10) || 1,
          parseInt(pageSize, 10) || 20,
          filters,
        );

      // items 已经是 DTO 格式，无需再次转换
      const totalPages = Math.ceil(total / curPageSize);

      return {
        success: true,
        shop,
        data: items,
        pagination: {
          page: curPage,
          page_size: curPageSize,
          total,
          total_pages: totalPages,
          has_next: curPage < totalPages,
          has_prev: curPage > 1,
        },
      };
    } catch (error: any) {
      this.logger.error(`[admin] Failed to fetch orders: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message,
      };
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

      return {
        success: true,
        shop,
        data: this.orderService.toResponseDto(order),
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
      return {
        success: true,
        shop,
        data: stats,
      };
    } catch (error: any) {
      this.logger.error(`[admin] Failed to fetch order stats: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取同步状态概览
   */
  @Get('orders/sync/status')
  async getSyncStatus() {
    try {
      const summary = await this.syncScheduler.getSyncSummary();
      return {
        success: true,
        data: summary,
      };
    } catch (error: any) {
      this.logger.error(`[admin] Failed to get sync status: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }

  /**
   * 手动触发同步（全量）
   */
  @Post('orders/sync/manual')
  async manualSync(@Req() req: Request, @Query('shop') shop?: string) {
    try {
      const targetShop = shop || (req as any).shopify?.shop;
      if (!targetShop) {
        return { success: false, error: 'shop 参数必填' };
      }

      const results = await this.syncScheduler.manualSync(targetShop);
      return {
        success: true,
        message: `同步完成，共同步 ${results.reduce((sum, r) => sum + r.synced, 0)} 条订单`,
        data: results,
      };
    } catch (error: any) {
      this.logger.error(`[admin] Failed to trigger manual sync: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }

  /**
   * 强制全量同步（回溯最近7天）
   */
  @Post('orders/sync/force')
  async forceSync(@Req() req: Request, @Query('shop') shop?: string) {
    try {
      const targetShop = shop || (req as any).shopify?.shop;
      if (!targetShop) {
        return { success: false, error: 'shop 参数必填' };
      }

      const synced = await this.syncScheduler.forceFullSync(targetShop);
      return {
        success: true,
        message: `强制同步完成，共同步 ${synced} 条订单`,
        data: { shop: targetShop, synced },
      };
    } catch (error: any) {
      this.logger.error(`[admin] Failed to trigger force sync: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }
}
