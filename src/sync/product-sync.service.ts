import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseSyncService } from './base-sync.service';
import { ProductService } from '../products/product.service';
import { ShopifySessionService } from '../shopify/session/shopify-session.service';
import { SyncRecordEntity } from '../database/entities/sync-record.entity';

/**
 * 商品同步服务（三层补偿机制第三层）
 *
 * 继承 BaseSyncService，只实现商品特有的三个方法：
 * - getLocalCount: 本地商品数
 * - saveItem: 保存单条商品
 * - fetchFromShopify: 从 Shopify REST API 分页拉取商品
 */
@Injectable()
export class ProductSyncService extends BaseSyncService {
  constructor(
    protected readonly sessionService: ShopifySessionService,
    @InjectRepository(SyncRecordEntity)
    protected readonly syncRecordRepository: Repository<SyncRecordEntity>,
    private readonly productService: ProductService,
  ) {
    super(sessionService, syncRecordRepository, 'products');
  }

  // 保留对外方法名，内部委托基类
  async syncProducts(shop: string): Promise<number> {
    return this.sync(shop);
  }

  async forceSyncProducts(shop: string, since: Date): Promise<number> {
    return this.forceSync(shop, since);
  }

  // ---------------- 基类抽象方法实现 ----------------

  protected async getLocalCount(shop: string): Promise<number> {
    return this.productService.getProductCount(shop);
  }

  protected async saveItem(shop: string, item: any): Promise<any> {
    return this.productService.saveProduct(shop, item);
  }

  protected async fetchFromShopify(
    shop: string,
    startTime: Date,
    endTime: Date,
  ): Promise<any[]> {
    const session = await this.sessionService.loadSession(`${shop}_offline`);
    if (!session) {
      throw new Error(`No offline session found for ${shop}`);
    }

    const accessToken = session.accessToken;
    const allProducts: any[] = [];
    let sinceId: string | undefined;

    const startStr = startTime.toISOString();
    const endStr = endTime.toISOString();

    while (true) {
      const url = new URL(`https://${shop}/admin/api/2024-01/products.json`);
      url.searchParams.set('limit', String(this.BATCH_SIZE));
      url.searchParams.set('created_at_min', startStr);
      url.searchParams.set('created_at_max', endStr);
      if (sinceId) {
        url.searchParams.set('since_id', sinceId);
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Shopify API error: ${response.status} - ${text}`);
      }

      const data = await response.json();
      const products = data.products || [];

      if (products.length === 0) {
        break;
      }

      allProducts.push(...products);
      sinceId = String(products[products.length - 1].id);

      if (products.length < this.BATCH_SIZE) {
        break;
      }

      // 避免 API 限流
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    this.logger.log(`[REST] Total products fetched for ${shop}: ${allProducts.length}`);
    return allProducts;
  }
}
