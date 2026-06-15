import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Session, OnlineAccessInfo } from '@shopify/shopify-api';
import { ShopSessionEntity } from '../../database/entities/shop-session.entity';

/**
 * 自定义数据库 Session 存储服务。
 *
 * 该服务实现了 @shopify/shopify-api 所需的 SessionStorage 接口的语义。
 * - storeSession(session): 保存或更新一个会话。
 * - loadSession(id): 根据 id（格式 shop_type 或 shop）加载会话。
 * - deleteSession(id): 删除会话。
 * - findSessionsByShop(shop): 根据 shop 查找所有会话。
 *
 * 同时暴露 getSessionStorage() 方法返回符合 shopify-api 类型的 SessionStorage 对象，
 * 供 shopifyApi() 初始化使用。
 */
@Injectable()
export class ShopifySessionService implements OnModuleInit {
  private readonly logger = new Logger(ShopifySessionService.name);

  constructor(
    @InjectRepository(ShopSessionEntity)
    private readonly sessionRepository: Repository<ShopSessionEntity>,
  ) {}

  onModuleInit() {
    this.logger.log('Shopify database session storage initialized');
  }

  /**
   * 将数据库实体转换为 Shopify Session 对象。
   */
  private toSession(id: string, entity: ShopSessionEntity): Session {
    const isOnline = entity.sessionType === 'online';
    
    // 将 JSON 字符串反序列化为 OnlineAccessInfo 对象
    let onlineAccessInfo: OnlineAccessInfo | undefined;
    if (entity.onlineAccessInfo) {
      try {
        const parsed = typeof entity.onlineAccessInfo === 'string'
          ? JSON.parse(entity.onlineAccessInfo)
          : entity.onlineAccessInfo;
        // 验证必需字段
        if (parsed && parsed.expires_in !== undefined && parsed.associated_user) {
          onlineAccessInfo = parsed as OnlineAccessInfo;
        }
      } catch {
        // 解析失败，忽略
      }
    }
    
    const session = new Session({
      id,
      shop: entity.shop,
      state: entity.state || 'state',
      isOnline,
      accessToken: entity.accessToken || undefined,
      scope: entity.scope || undefined,
      expires: entity.expiresAt ?? undefined,
    });

    if (isOnline && onlineAccessInfo) {
      session.onlineAccessInfo = onlineAccessInfo;
    }

    return session;
  }

  /**
   * 挅久化一个 Session 到数据库。
   */
  async storeSession(session: Session): Promise<boolean> {
    try {
      const shop = session.shop;
      const sessionType: 'online' | 'offline' = session.isOnline ? 'online' : 'offline';

      this.logger.debug(`storeSession called: shop=${shop}, type=${sessionType}, scope=${session.scope}`);

      let entity = await this.sessionRepository.findOne({
        where: { shop, sessionType },
      });

      const expiresAt: Date | null = session.expires ?? null;

      // 将 onlineAccessInfo 序列化为 JSON 字符串
      const onlineAccessInfoStr = session.onlineAccessInfo
        ? JSON.stringify(session.onlineAccessInfo)
        : null;

      if (entity) {
        entity.state = session.state;
        entity.scope = session.scope;
        entity.accessToken = session.accessToken;
        entity.expiresAt = expiresAt;
        entity.onlineAccessInfo = onlineAccessInfoStr as any;
        entity.updatedAt = new Date();
      } else {
        entity = new ShopSessionEntity();
        entity.shop = shop;
        entity.state = session.state;
        entity.scope = session.scope;
        entity.accessToken = session.accessToken;
        entity.expiresAt = expiresAt;
        entity.sessionType = sessionType;
        entity.onlineAccessInfo = onlineAccessInfoStr as any;
      }

      await this.sessionRepository.save(entity);
      this.logger.log(`Session stored successfully for shop: ${shop}, type: ${sessionType}, scope: ${session.scope}`);
      return true;
    } catch (error: any) {
      this.logger.error(`Failed to store session: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * 根据 id 加载 Session。id 格式可为 shop_offline / shop_online / shop（默认 offline）。
   */
  async loadSession(id: string): Promise<Session | undefined> {
    try {
      const [shop, sessionTypeRaw] = this.parseSessionId(id);
      const sessionType = (sessionTypeRaw || 'offline') as 'online' | 'offline';

      const entity = await this.sessionRepository.findOne({
        where: { shop, sessionType },
      });

      if (!entity) {
        return undefined;
      }

      return this.toSession(id, entity);
    } catch (error: any) {
      this.logger.error(`Failed to load session: ${error.message}`, error.stack);
      return undefined;
    }
  }

  /**
   * 删除 Session。
   */
  async deleteSession(id: string): Promise<boolean> {
    try {
      const [shop, sessionTypeRaw] = this.parseSessionId(id);
      const sessionType = (sessionTypeRaw || 'offline') as 'online' | 'offline';

      await this.sessionRepository.delete({ shop, sessionType });
      return true;
    } catch (error: any) {
      this.logger.error(`Failed to delete session: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * 根据店铺查找所有会话。
   */
  async findSessionsByShop(shop: string): Promise<Session[]> {
    try {
      const entities = await this.sessionRepository.find({ where: { shop } });

      return entities.map((entity) =>
        this.toSession(`${entity.shop}_${entity.sessionType}`, entity),
      );
    } catch (error: any) {
      this.logger.error(`Failed to find sessions by shop: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * 返回一个符合 shopify-api SessionStorage 接口的对象。
   * 注意：方法必须绑定当前 this 上下文。
   */
  getSessionStorage() {
    return {
      storeSession: this.storeSession.bind(this),
      loadSession: this.loadSession.bind(this),
      deleteSession: this.deleteSession.bind(this),
      findSessionsByShop: this.findSessionsByShop.bind(this),
    };
  }

  /**
   * 便捷方法：获取店铺的 offline access token。
   */
  async getOfflineToken(shop: string): Promise<string | null> {
    try {
      // 规范化 shop 名称为小写，确保与存储格式一致
      const normalizedShop = shop.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
      
      this.logger.debug(`Looking for offline token, normalized shop: ${normalizedShop}`);
      
      const entity = await this.sessionRepository.findOne({
        where: { shop: normalizedShop, sessionType: 'offline' as any },
      });
      
      this.logger.debug(`Database query result: ${JSON.stringify(entity)}`);
      
      return entity?.accessToken || null;
    } catch (error: any) {
      this.logger.error(`Failed to get offline token: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * 便捷方法：删除该店铺的所有会话（例如卸载 webhook 时调用）。
   */
  async deleteSessionsByShop(shop: string): Promise<boolean> {
    try {
      await this.sessionRepository.delete({ shop });
      return true;
    } catch (error: any) {
      this.logger.error(`Failed to delete sessions by shop: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * 便捷方法：获取该店铺的 offline session 完整信息（不含敏感字段）。
   */
  async getOfflineSessionInfo(shop: string): Promise<{
    shop: string;
    hasToken: boolean;
    scopes: string[];
    scopesString: string;
    expiresAt: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  } | null> {
    try {
      const normalizedShop = shop.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/$/, '');

      const entity = await this.sessionRepository.findOne({
        where: { shop: normalizedShop, sessionType: 'offline' as any },
      });

      if (!entity) return null;

      const scopes = entity.scope ? entity.scope.split(',').map((s) => s.trim()) : [];

      return {
        shop: entity.shop,
        hasToken: !!entity.accessToken,
        scopes,
        scopesString: entity.scope || '',
        expiresAt: entity.expiresAt ? entity.expiresAt.toISOString() : null,
        createdAt: entity.createdAt ? entity.createdAt.toISOString() : null,
        updatedAt: entity.updatedAt ? entity.updatedAt.toISOString() : null,
      };
    } catch (error: any) {
      this.logger.error(`Failed to get session info: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * 检查该店铺 offline token 中是否包含所需的所有 scopes。
   * 返回 { ok, missingScopes, storedScopes }。
   */
  async checkScopes(shop: string, requiredScopes: string[]): Promise<{
    ok: boolean;
    missingScopes: string[];
    storedScopes: string[];
  }> {
    try {
      const normalizedShop = shop.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/$/, '');

      const entity = await this.sessionRepository.findOne({
        where: { shop: normalizedShop, sessionType: 'offline' as any },
      });

      const storedScopes: string[] = entity?.scope
        ? entity.scope.split(',').map((s) => s.trim())
        : [];

      const missingScopes = requiredScopes.filter((s) => !storedScopes.includes(s.trim()));

      return {
        ok: missingScopes.length === 0 && storedScopes.length > 0,
        missingScopes,
        storedScopes,
      };
    } catch (error: any) {
      this.logger.error(`Failed to check scopes: ${error.message}`, error.stack);
      return { ok: false, missingScopes: requiredScopes, storedScopes: [] };
    }
  }

  /**
   * 检查 offline token 是否存在且未过期。
   */
  async hasValidOfflineToken(shop: string): Promise<boolean> {
    try {
      const normalizedShop = shop.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/$/, '');

      const entity = await this.sessionRepository.findOne({
        where: { shop: normalizedShop, sessionType: 'offline' as any },
      });

      if (!entity?.accessToken) return false;
      if (entity.expiresAt && entity.expiresAt.getTime() < Date.now()) {
        return false;
      }
      return true;
    } catch (error: any) {
      this.logger.error(`Failed to check valid offline token: ${error.message}`, error.stack);
      return false;
    }
  }

  private parseSessionId(id: string): [string, 'online' | 'offline' | undefined] {
    const parts = id.split('_');
    if (parts.length >= 2) {
      const type = parts[parts.length - 1];
      if (type === 'online' || type === 'offline') {
        const shop = parts.slice(0, -1).join('_');
        return [shop, type];
      }
    }
    return [id, undefined];
  }
}
