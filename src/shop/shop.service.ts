import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ShopEntity } from '../database/entities/shop.entity';
import { UserShopEntity } from '../database/entities/user-shop.entity';

/**
 * 店铺服务
 *
 * 负责：
 * - 根据 Shopify 的 shop.json / shop/update 数据同步
 * - 店铺的缓存维护
 * - 用户-店铺 关联
 */
@Injectable()
export class ShopService {
  private readonly logger = new Logger(ShopService.name);

  constructor(
    @InjectRepository(ShopEntity)
    private readonly shopRepo: Repository<ShopEntity>,

    @InjectRepository(UserShopEntity)
    private readonly userShopRepo: Repository<UserShopEntity>,
  ) {}

  /**
   * 根据 Shopify shop.json 的原始数据插入/更新店铺信息缓存（upsert）
   *
   * @param shop 店铺域名
   * @param shopPayload shop.json / shop/update 的原始数据
   */
  async upsertFromShopifyPayload(
    shop: string,
    shopPayload: any,
  ): Promise<ShopEntity> {
    if (!shop) {
      throw new Error('shop is required for upsertFromShopifyPayload');
    }

    const shopifyId = shopPayload?.id ? String(shopPayload.id) : null;
    const shopifyUpdatedAt = shopPayload?.updated_at
      ? new Date(shopPayload.updated_at)
      : new Date();

    const existing = await this.shopRepo.findOne({ where: { shop } });
    const entity = existing || this.shopRepo.create({ shop });

    entity.shopifyId = shopifyId;
    entity.name = shopPayload?.name || entity.name;
    entity.email = shopPayload?.email || entity.email;
    entity.domain = shopPayload?.domain || entity.domain;
    entity.currencyCode = shopPayload?.currency || shopPayload?.currency_code || entity.currencyCode;
    entity.ianaTimezone = shopPayload?.iana_timezone || shopPayload?.timezone || entity.ianaTimezone;
    entity.countryCode = shopPayload?.country_code || shopPayload?.country || entity.countryCode;
    entity.province = shopPayload?.province || entity.province;
    entity.city = shopPayload?.city || entity.city;
    entity.address1 = shopPayload?.address1 || entity.address1;
    entity.zip = shopPayload?.zip || entity.zip;
    entity.phone = shopPayload?.phone || entity.phone;
    entity.scope = shopPayload?.scope || entity.scope;
    entity.shopifyUpdatedAt = shopifyUpdatedAt;

    const saved = await this.shopRepo.save(entity);
    this.logger.log(`Shop info upserted: ${shop} (${saved.name || 'unnamed'})`);
    return saved;
  }

  /**
   * 根据店铺域名获取店铺信息（若本地无数据，则返回 null（用于判断是否有缓存）
   */
  async getByShop(shop: string): Promise<ShopEntity | null> {
    if (!shop) return null;
    return this.shopRepo.findOne({ where: { shop } });
  }

  /**
   * 根据店铺域名（可能为多个店铺的信息（用于列表/数据查询）
   */
  async getByShops(shops: string[]): Promise<Record<string, ShopEntity>> {
    if (!shops || shops.length === 0) return {};
    const rows = await this.shopRepo.find({ where: { shop: In(shops) } });
    const map: Record<string, ShopEntity> = {};
    for (const r of rows) map[r.shop] = r;
    return map;
  }

  /**
   * 获取所有店铺列表（支持分页（用于独立应用的列表）
   */
  async findAll(page: number = 1, pageSize: number = 20): Promise<{ items: ShopEntity[]; total: number }> {
    const safePage = Math.max(1, page);
    const safeSize = Math.min(100, Math.max(1, pageSize));
    const offset = (safePage - 1) * safeSize;
    const [items, total] = await this.shopRepo.findAndCount({
      order: { updatedAt: 'DESC' },
      take: safeSize,
      skip: offset,
    });
    return { items, total };
  }

  // ======== 用户-店铺 关联 ========

  /**
   * 获取某个用户可管理的所有店铺（含店铺信息）
   */
  async getUserShops(userId: string): Promise<Array<Omit<UserShopEntity, 'shop'> & { shop: ShopEntity }>> {
    const userShops = await this.userShopRepo.find({
      where: { userId, isActive: 1 },
      order: { createdAt: 'DESC' },
    });

    const shopDomains = userShops.map((us) => us.shop);
    const shopMap = await this.getByShops(shopDomains);

    return userShops.map((us) => {
      const fallback: ShopEntity = {
        id: '',
        shop: us.shop,
        shopifyId: null,
        name: us.shop,
        email: null,
        domain: null,
        currencyCode: null,
        ianaTimezone: null,
        countryCode: null,
        province: null,
        city: null,
        address1: null,
        zip: null,
        phone: null,
        scope: null,
        isActive: 1,
        shopifyUpdatedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdUser: null,
        modifiedUser: null,
      } as ShopEntity;
      return { ...us, shop: shopMap[us.shop] || fallback };
    });
  }

  /**
   * 获取某用户可管理的店铺域名列表（用于订单/商品列表按可管理的店铺过滤）
   */
  async getManagedShopDomains(userId: string): Promise<string[]> {
    const userShops = await this.userShopRepo.find({
      where: { userId, isActive: 1 },
    });
    return userShops.map((us) => us.shop);
  }

  /**
   * 为用户添加一个可管理的店铺（若已存在则跳过，否则插入）
   */
  async ensureUserShop(
    userId: string,
    shop: string,
    role: 'owner' | 'staff' | 'viewer' = 'owner',
  ): Promise<UserShopEntity> {
    const existing = await this.userShopRepo.findOne({ where: { userId, shop } });
    if (existing) {
      if (!existing.isActive) {
        existing.isActive = 1;
      }
      existing.role = role;
      existing.updatedAt = new Date();
      return this.userShopRepo.save(existing);
    }

    const created = this.userShopRepo.create({ userId, shop, role });
    return this.userShopRepo.save(created);
  }

  /**
   * 从用户可管理店铺中移除某个店铺
   */
  async removeUserShop(userId: string, shop: string): Promise<void> {
    await this.userShopRepo.delete({ userId, shop });
    this.logger.log(`Removed shop ${shop} from user ${userId}`);
  }

  /**
   * 将店铺 isActive 标为删除（店铺未安装应用）清理数据与 OAuth 授权成功后调用
   */
  async setActive(shop: string, isActive: number): Promise<void> {
    await this.shopRepo.update({ shop }, { isActive, updatedAt: new Date() });
    this.logger.log(`Set shop ${shop} isActive=${isActive}`);
  }
}
