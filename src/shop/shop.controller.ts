import { Controller, Get, Query, Req, Logger, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ShopService } from './shop.service';
import { ShopifyAuthGuard } from '../shopify/auth/auth.guard';

/**
 * 店铺信息管理接口
 *
 * - GET /api/admin/shops              店铺列表（分页）
 * - GET /api/admin/shops?shop=xxx     单个店铺详情
 */
@Controller('api/admin/shops')
@UseGuards(ShopifyAuthGuard)
export class ShopController {
  private readonly logger = new Logger(ShopController.name);

  constructor(private readonly shopService: ShopService) {}

  @Get()
  async getShops(
    @Req() req: Request,
    @Query('page') page: string = '1',
    @Query('page_size') pageSize: string = '20',
    @Query('shop') shop?: string,
  ) {
    try {
      // 若传了 shop，则查单条详情
      if (shop) {
        const s = await this.shopService.getByShop(shop);
        return { success: true, data: s };
      }

      const { items, total } = await this.shopService.findAll(
        parseInt(page, 10) || 1,
        parseInt(pageSize, 10) || 20,
      );
      return {
        success: true,
        data: items,
        pagination: {
          page: parseInt(page, 10) || 1,
          page_size: parseInt(pageSize, 10) || 20,
          total,
          total_pages: Math.ceil(total / (parseInt(pageSize, 10) || 20)),
        },
      };
    } catch (error: any) {
      this.logger.error(`Failed to fetch shops: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }
}
