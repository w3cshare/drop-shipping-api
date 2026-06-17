import { Controller, Get, Query, Param, UseGuards, Req, Logger } from '@nestjs/common';
import { Request } from 'express';
import { ShopifyAuthGuard } from '../shopify/auth/auth.guard';
import { ProductService } from './product.service';
import { ProductFiltersDto } from './product.dto';
import { ShopService } from '../shop/shop.service';

/**
 * 商品管理接口（直接从数据库读取）
 *
 * 路由前缀：/api/admin
 * 鉴权：    ShopifyAuthGuard（通过 ?shop=xxx 或 Bearer token 绑定店铺上下文）
 */
@Controller('api/admin')
@UseGuards(ShopifyAuthGuard)
export class ProductsController {
  private readonly logger = new Logger(ProductsController.name);

  constructor(
    private readonly productService: ProductService,
    private readonly shopService: ShopService,
  ) {}

  /**
   * 商品列表（从数据库直读）
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

      // 读取店铺信息，统一附加到每条商品
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
        this.productService.toResponseDto(item as any, shopInfo),
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

      const product = await this.productService.findProductById(shop, productId);
      if (!product) {
        return { success: false, error: 'Product not found' };
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
        data: this.productService.toResponseDto(product, shopInfo),
      };
    } catch (error: any) {
      this.logger.error(`[admin] Failed to fetch product detail: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }
}
