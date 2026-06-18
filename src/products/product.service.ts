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
   * 保存或更新商品（使用 upsert，基于 productId + shop 唯一约束）
   */
  async saveProduct(shop: string, productData: any): Promise<ShopProductEntity> {
    try {
      const productId = String(productData.id);

      const product = new ShopProductEntity();

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

      // 使用 upsert 原子操作，避免 findOne + save 导致的竞态条件和重复
      await this.productRepository.upsert(product, {
        conflictPaths: ['productId', 'shop'],
        skipUpdateIfNoValuesChanged: true,
      });

      const saved = await this.productRepository.findOne({ where: { productId, shop } });
      this.logger.log(`Product ${productId} saved for shop ${shop}`);
      return saved!;
    } catch (error: any) {
      this.logger.error(`Failed to save product: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 构建商品基础查询（共享给列表/详情/计数）
   *
   * LEFT JOIN b_3rd_shops，一条 SQL 完成商品+店铺信息查询。
   */
  private buildProductBaseQuery(shop: string, filters: ProductFiltersDto = {}) {
    const qb = this.productRepository
      .createQueryBuilder('p')
      .leftJoin('b_3rd_shops', 's', 's.shop = p.shop')
      .where('p.shop = :shop', { shop });

    if (filters.status) {
      qb.andWhere('p.status = :status', { status: filters.status });
    }
    if (filters.productType) {
      qb.andWhere('p.product_type = :productType', { productType: filters.productType });
    }
    if (filters.vendor) {
      qb.andWhere('p.vendor = :vendor', { vendor: filters.vendor });
    }
    if (filters.startDate) {
      qb.andWhere('p.created_time >= :startDate', { startDate: filters.startDate });
    }
    if (filters.endDate) {
      qb.andWhere('p.created_time <= :endDate', { endDate: filters.endDate });
    }
    if (filters.keyword) {
      const kw = `%${filters.keyword}%`;
      qb.andWhere(
        new Brackets((qb) => {
          qb.where('p.title LIKE :kw', { kw })
            .orWhere('p.handle LIKE :kw', { kw })
            .orWhere('p.tags LIKE :kw', { kw });
        }),
      );
    }

    return qb;
  }

  /**
   * 分页查询商品（LEFT JOIN 店铺表，一条 SQL 返回商品+店铺信息）
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

    const commonSelect = [
      'p.id AS p_id',
      'p.product_id AS p_product_id',
      'p.title AS p_title',
      'p.shop AS p_shop',
      'p.handle AS p_handle',
      'p.description AS p_description',
      'p.vendor AS p_vendor',
      'p.product_type AS p_product_type',
      'p.status AS p_status',
      'p.tags AS p_tags',
      'p.images AS p_images',
      'p.variants AS p_variants',
      'p.options AS p_options',
      'p.created_time AS p_created_time',
      'p.modified_time AS p_modified_time',
      'p.db_created_time AS p_db_created_time',
      'p.db_modified_time AS p_db_modified_time',
      's.name AS s_name',
      's.email AS s_email',
      's.domain AS s_domain',
      's.currency_code AS s_currency_code',
      's.country_code AS s_country_code',
    ];

    const listQb = this.buildProductBaseQuery(shop, filters)
      .select(commonSelect)
      .orderBy('p.created_time', 'DESC')
      .limit(safePageSize)
      .offset(offset);

    const countQb = this.buildProductBaseQuery(shop, filters);

    const [rawList, total] = await Promise.all([listQb.getRawMany(), countQb.getCount()]);

    const items = rawList.map((row: any) =>
      this.toResponseDto(
        {
          id: row.p_id,
          productId: row.p_product_id,
          title: row.p_title,
          shop: row.p_shop,
          handle: row.p_handle,
          description: row.p_description,
          vendor: row.p_vendor,
          productType: row.p_product_type,
          status: row.p_status,
          tags: row.p_tags,
          images: row.p_images,
          variants: row.p_variants,
          options: row.p_options,
          createdAt: row.p_created_time,
          updatedAt: row.p_modified_time,
          dbCreatedAt: row.p_db_created_time,
          dbUpdatedAt: row.p_db_modified_time,
        } as ShopProductEntity,
        {
          name: row.s_name ?? null,
          email: row.s_email ?? null,
          domain: row.s_domain ?? null,
          currency_code: row.s_currency_code ?? null,
          country_code: row.s_country_code ?? null,
        },
      ),
    );

    return {
      items,
      total,
      page: safePage,
      pageSize: safePageSize,
    };
  }

  /**
   * 按商品 ID 获取一条（LEFT JOIN 店铺表，含 shop 隔离）
   */
  async findProductById(shop: string, productId: string): Promise<ProductResponseDto | null> {
    const row = await this.productRepository
      .createQueryBuilder('p')
      .leftJoin('b_3rd_shops', 's', 's.shop = p.shop')
      .where('p.shop = :shop', { shop })
      .andWhere('p.product_id = :productId', { productId })
      .select([
        'p.id AS p_id',
        'p.product_id AS p_product_id',
        'p.title AS p_title',
        'p.shop AS p_shop',
        'p.handle AS p_handle',
        'p.description AS p_description',
        'p.vendor AS p_vendor',
        'p.product_type AS p_product_type',
        'p.status AS p_status',
        'p.tags AS p_tags',
        'p.images AS p_images',
        'p.variants AS p_variants',
        'p.options AS p_options',
        'p.created_time AS p_created_time',
        'p.modified_time AS p_modified_time',
        'p.db_created_time AS p_db_created_time',
        'p.db_modified_time AS p_db_modified_time',
        's.name AS s_name',
        's.email AS s_email',
        's.domain AS s_domain',
        's.currency_code AS s_currency_code',
        's.country_code AS s_country_code',
      ])
      .getRawOne();

    if (!row) return null;

    return this.toResponseDto(
      {
        id: row.p_id,
        productId: row.p_product_id,
        title: row.p_title,
        shop: row.p_shop,
        handle: row.p_handle,
        description: row.p_description,
        vendor: row.p_vendor,
        productType: row.p_product_type,
        status: row.p_status,
        tags: row.p_tags,
        images: row.p_images,
        variants: row.p_variants,
        options: row.p_options,
        createdAt: row.p_created_time,
        updatedAt: row.p_modified_time,
        dbCreatedAt: row.p_db_created_time,
        dbUpdatedAt: row.p_db_modified_time,
      } as ShopProductEntity,
      {
        name: row.s_name ?? null,
        email: row.s_email ?? null,
        domain: row.s_domain ?? null,
        currency_code: row.s_currency_code ?? null,
        country_code: row.s_country_code ?? null,
      },
    );
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
    await this.productRepository.delete({ productId, shop });
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
