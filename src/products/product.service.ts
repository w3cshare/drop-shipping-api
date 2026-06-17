import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { ShopProductEntity } from '../database/entities/product.entity';
import {
  ProductFiltersDto,
  PaginatedProductsResponseDto,
  ProductResponseDto,
  safeParseJson,
} from './product.dto';

/**
 * 商品服务
 *
 * 处理 Shopify 商品的存储、查询和更新
 */
@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);

  constructor(
    @InjectRepository(ShopProductEntity)
    private readonly productRepository: Repository<ShopProductEntity>,
  ) {}

  /**
   * 保存或更新商品
   *
   * @param shop 店铺域名
   * @param productData Shopify Webhook 推送的商品数据
   */
  async saveProduct(shop: string, productData: any): Promise<ShopProductEntity> {
    try {
      const productId = String(productData.id);

      // 检查商品是否已存在
      const existing = await this.productRepository.findOne({
        where: { productId: productId, shop },
      });

      const product = existing || new ShopProductEntity();

      // 基础信息
      product.productId = productId;
      product.shop = shop;
      product.title = productData.title || '';
      product.handle = productData.handle || '';
      product.description = productData.body_html || productData.description || '';
      product.vendor = productData.vendor || '';
      product.productType = productData.product_type || '';
      product.status = productData.status || 'draft';

      // 标签（数组转逗号分隔字符串）
      if (productData.tags) {
        product.tags = Array.isArray(productData.tags)
          ? productData.tags.join(',')
          : String(productData.tags);
      }

      // 时间信息
      product.createdAt = productData.created_at ? new Date(productData.created_at) : new Date();
      product.updatedAt = productData.updated_at ? new Date(productData.updated_at) : new Date();

      // 图片（JSON 格式存储）
      if (productData.images) {
        product.images = JSON.stringify(productData.images);
      }

      // 变体（JSON 格式存储）
      if (productData.variants) {
        product.variants = JSON.stringify(productData.variants);
      }

      // 选项配置（JSON 格式存储）
      if (productData.options) {
        product.options = JSON.stringify(productData.options);
      }

      const saved = await this.productRepository.save(product);
      this.logger.log(`Product ${productId} saved for shop ${shop}`);
      return saved;
    } catch (error: any) {
      this.logger.error(`Failed to save product: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 按商品 ID 获取一条（含 shop 隔离）
   */
  async findProductById(shop: string, productId: string): Promise<ShopProductEntity | null> {
    return this.productRepository.findOne({ where: { shop, productId: productId } });
  }

  /**
   * 分页查询商品（数据库直读，支持多条件过滤）
   */
  async findProductsWithPagination(
    shop: string,
    page: number = 1,
    pageSize: number = 20,
    filters: ProductFiltersDto = {},
  ): Promise<PaginatedProductsResponseDto> {
    const safePage = Math.max(1, page);
    const safePageSize = Math.min(100, Math.max(1, pageSize));
    const offset = (safePage - 1) * safePageSize;

    const query = this.productRepository.createQueryBuilder('p').where('p.shop = :shop', { shop });

    if (filters.status) {
      query.andWhere('p.status = :status', { status: filters.status });
    }
    if (filters.productType) {
      query.andWhere('p.product_type = :productType', { productType: filters.productType });
    }
    if (filters.vendor) {
      query.andWhere('p.vendor = :vendor', { vendor: filters.vendor });
    }
    if (filters.startDate) {
      query.andWhere('p.created_time >= :startDate', { startDate: filters.startDate });
    }
    if (filters.endDate) {
      query.andWhere('p.created_time <= :endDate', { endDate: filters.endDate });
    }
    if (filters.keyword) {
      const kw = `%${filters.keyword}%`;
      query.andWhere(
        new Brackets((qb) => {
          qb.where('p.title LIKE :kw', { kw })
            .orWhere('p.handle LIKE :kw', { kw })
            .orWhere('p.tags LIKE :kw', { kw });
        }),
      );
    }

    const [items, total] = await query
      .orderBy('p.created_time', 'DESC')
      .take(safePageSize)
      .skip(offset)
      .getManyAndCount();

    return {
      items: items.map((p) => this.toResponseDto(p)),
      total,
      page: safePage,
      pageSize: safePageSize,
    };
  }

  /**
   * 获取商品数量
   */
  async getProductCount(shop: string): Promise<number> {
    return this.productRepository.count({ where: { shop } });
  }

  /**
   * 删除商品（含 shop 隔离）
   */
  async deleteProduct(shop: string, productId: string): Promise<void> {
    await this.productRepository.delete({ productId: productId, shop });
    this.logger.log(`Product ${productId} deleted for shop ${shop}`);
  }

  /**
   * 删除店铺的所有商品
   */
  async deleteProductsByShop(shop: string): Promise<void> {
    await this.productRepository.delete({ shop });
    this.logger.log(`All products deleted for shop ${shop}`);
  }

  /**
   * 将数据库实体转换为对外响应 DTO
   */
  toResponseDto(product: ShopProductEntity, shopInfo?: {
    name: string | null;
    email: string | null;
    domain: string | null;
    currency_code: string | null;
    country_code: string | null;
  } | null): ProductResponseDto {
    return {
      id: product.id,
      product_id: product.productId,
      name: product.title,
      shop: product.shop,
      shop_name: shopInfo?.name ?? null,
      shop_email: shopInfo?.email ?? null,
      shop_domain: shopInfo?.domain ?? null,
      shop_currency: shopInfo?.currency_code ?? null,
      title: product.title,
      handle: product.handle,
      description: product.description,
      vendor: product.vendor,
      product_type: product.productType,
      status: product.status,
      tags: product.tags ? product.tags.split(',').filter(Boolean) : [],
      images: safeParseJson(product.images) as Record<string, any>[] | null,
      variants: safeParseJson(product.variants) as Record<string, any>[] | null,
      options: safeParseJson(product.options) as Record<string, any>[] | null,
      created_at: product.createdAt?.toISOString() ?? null,
      updated_at: product.updatedAt?.toISOString() ?? null,
      db_created_at: product.dbCreatedAt?.toISOString() ?? null,
      db_updated_at: product.dbUpdatedAt?.toISOString() ?? null,
    };
  }
}
