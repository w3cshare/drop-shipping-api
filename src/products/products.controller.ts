import { Controller, Get, Query, Param, UseGuards, Req, Logger, Post } from '@nestjs/common';
import { Request } from 'express';
import { ShopifyAuthGuard } from '../shopify/auth/auth.guard';
import { ProductService } from './product.service';
import { ProductFiltersDto } from './product.dto';
import { SyncScheduler } from '../sync/sync-scheduler';

/**
 * 商品管理接口（数据库直读）
 *
 * 列表/详情查询：ProductService 内部已 LEFT JOIN b_3rd_shops，
 * 一条 SQL 同时返回商品+店铺信息，避免 N+1 查询。
 * 鉴权：    ShopifyAuthGuard（通过 ?shop=xxx 或 Bearer token 绑定店铺上下文）
 *
 * 接口：
 *   GET  /api/admin/products          商品列表（分页 + 过滤）
 *   GET  /api/admin/products/:id      商品详情
 *   GET  /api/admin/products/sync/status   商品同步状态
 *   POST /api/admin/products/sync/manual   手动触发商品同步
 *   POST /api/admin/products/sync/force    强制商品全量同步（回溯 7 天）
 */
@Controller('api/admin')
@UseGuards(ShopifyAuthGuard)
export class ProductsController {
  private readonly logger = new Logger(ProductsController.name);

  constructor(
    private readonly productService: ProductService,
    private readonly syncScheduler: SyncScheduler,
  ) {}

  /**
   * 商品列表（分页 + 过滤）
   */
  @Get('products')
  async getProducts(
    @Req() req: Request,
    @Query('page') page: string = '1',
    @Query('page_size') pageSize: string = '20',
    @Query('status') status?: string,
    @Query('product_type') productType?: string,
    @Query('vendor') vendor?: string,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
    @Query('keyword') keyword?: string,
  ) {
    try {
      const shop = (req as any).shopify?.shop as string;
      this.logger.log(`[admin] Fetching products from DB for shop: ${shop}`);

      const filters: ProductFiltersDto = {};
      if (status) filters.status = status;
      if (productType) filters.productType = productType;
      if (vendor) filters.vendor = vendor;
      if (startDate) filters.startDate = new Date(startDate);
      if (endDate) filters.endDate = new Date(endDate);
      if (keyword) filters.keyword = keyword;

      const result = await this.productService.findProductsWithPagination(
        shop,
        parseInt(page, 10) || 1,
        parseInt(pageSize, 10) || 20,
        filters,
      );

      const totalPages = Math.ceil(result.total / (parseInt(pageSize, 10) || 20));

      return {
        success: true,
        shop,
        data: result.items,
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
      this.logger.error(`[admin] Failed to fetch products: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }

  /**
   * 商品详情
   */
  @Get('products/:id')
  async getProductDetail(@Req() req: Request, @Param('id') productId: string) {
    try {
      const shop = (req as any).shopify?.shop as string;
      if (!productId) {
        return { success: false, error: 'Product ID is required' };
      }

      const productDto = await this.productService.findProductById(shop, productId);
      if (!productDto) {
        return { success: false, error: 'Product not found' };
      }

      return {
        success: true,
        shop,
        data: productDto,
      };
    } catch (error: any) {
      this.logger.error(`[admin] Failed to fetch product detail: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }

  /**
   * 商品同步状态
   */
  @Get('products/sync/status')
  async getProductSyncStatus() {
    try {
      const status = await this.syncScheduler.getProductSyncStatus();
      return {
        success: true,
        data: status,
      };
    } catch (error: any) {
      this.logger.error(`[admin] Failed to get product sync status: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }

  /**
   * 手动触发商品同步
   */
  @Post('products/sync/manual')
  async manualProductSync(@Req() req: Request, @Query('shop') shop?: string) {
    try {
      const targetShop = shop || (req as any).shopify?.shop;
      if (!targetShop) {
        return { success: false, error: 'shop 参数必填' };
      }

      const results = await this.syncScheduler.manualProductSync(targetShop);
      return {
        success: true,
        message: `同步完成，共同步 ${results.reduce((sum, r) => sum + r.synced, 0)} 条商品`,
        data: results,
      };
    } catch (error: any) {
      this.logger.error(`[admin] Failed to trigger manual product sync: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }

  /**
   * 强制商品全量同步（回溯最近 7 天）
   */
  @Post('products/sync/force')
  async forceProductSync(@Req() req: Request, @Query('shop') shop?: string) {
    try {
      const targetShop = shop || (req as any).shopify?.shop;
      if (!targetShop) {
        return { success: false, error: 'shop 参数必填' };
      }

      const synced = await this.syncScheduler.forceFullProductSync(targetShop);
      return {
        success: true,
        message: `强制同步完成，共同步 ${synced} 条商品`,
        data: { shop: targetShop, synced },
      };
    } catch (error: any) {
      this.logger.error(`[admin] Failed to trigger force product sync: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }
}
