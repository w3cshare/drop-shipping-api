import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Session, OnlineAccessInfo } from '@shopify/shopify-api';
import { ShopSessionEntity } from '../../database/entities/shop-session.entity';
import { ShopifyModule } from '../shopify.module';

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
 *
 * Token 刷新机制：
 * - Offline token 过期前自动调用 tokenRefresh GraphQL mutation 刷新
 * - API 调用失败 401 时，自动刷新 token 并重试
 */
@Injectable()
export class ShopifySessionService implements OnModuleInit {
  private readonly logger = new Logger(ShopifySessionService.name);

  // Token 刷新的提前量：距离过期还有 7 天就刷新
  private readonly REFRESH_BEFORE_EXPIRE_MS = 7 * 24 * 60 * 60 * 1000;

  // 防止并发刷新的锁
  private readonly refreshLocks: Map<string, Promise<string | null>> = new Map();

  constructor(
    @InjectRepository(ShopSessionEntity)
    private readonly sessionRepository: Repository<ShopSessionEntity>,
  ) {}

  onModuleInit() {
    this.logger.log('Shopify database session storage initialized');
  }

  /**
   * 规范化 shop 名称：小写、去除协议和尾部斜杠。
   */
  private normalizeShop(shop: string): string {
    return shop.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  }

  /**
   * 判断 token 是否即将过期（需要刷新）。
   * - 没有 expiresAt：Shopify 旧版本 token 永不过期，不需要刷新
   * - 距离过期不足 REFRESH_BEFORE_EXPIRE_MS：需要刷新
   */
  private needsRefresh(expiresAt: Date | null | undefined): boolean {
    if (!expiresAt) return false;
    return expiresAt.getTime() - Date.now() < this.REFRESH_BEFORE_EXPIRE_MS;
  }

  /**
   * 通过 Shopify tokenRefresh GraphQL mutation 刷新 offline token。
   * 使用并发锁防止重复刷新。
   *
   * @returns 新的 access token，刷新失败返回 null
   */
  async refreshOfflineToken(shop: string): Promise<string | null> {
    const normalizedShop = this.normalizeShop(shop);

    // 检查是否已有刷新在进行
    const existingLock = this.refreshLocks.get(normalizedShop);
    if (existingLock) {
      this.logger.debug(`Waiting for existing token refresh for ${normalizedShop}`);
      return existingLock;
    }

    const refreshPromise = (async (): Promise<string | null> => {
      try {
        // 先获取当前 token
        const entity = await this.sessionRepository.findOne({
          where: { shop: normalizedShop, sessionType: 'offline' as any },
        });

        if (!entity?.accessToken) {
          this.logger.warn(`Cannot refresh token: no existing token for ${normalizedShop}`);
          return null;
        }

        this.logger.log(`Refreshing offline token for shop: ${normalizedShop}`);

        // 使用 shopify-api 的 GraphQL 客户端调用 tokenRefresh mutation
        const shopify = ShopifyModule.shopify;
        const session: any = {
          shop: normalizedShop,
          accessToken: entity.accessToken,
          isOnline: false,
          state: 'state',
        };

        const client = new shopify.clients.Graphql({ session });

        const mutation = `
          mutation TokenRefresh {
            tokenRefresh {
              accessToken
              expiresAt
            }
          }
        `;

        const result = await client.request(mutation);
        const resultAny = result as any;

        if (!resultAny?.tokenRefresh?.accessToken) {
          this.logger.error(`Token refresh returned no access token for ${normalizedShop}`);
          return null;
        }

        const newToken = resultAny.tokenRefresh.accessToken;
        const newExpiresAt = resultAny.tokenRefresh.expiresAt
          ? new Date(resultAny.tokenRefresh.expiresAt)
          : null;

        // 更新数据库
        await this.sessionRepository.update(
          { shop: normalizedShop, sessionType: 'offline' as any },
          {
            accessToken: newToken,
            expiresAt: newExpiresAt,
            updatedAt: new Date(),
          }
        );

        this.logger.log(
          `Offline token refreshed successfully for ${normalizedShop}, ` +
            `expires at: ${newExpiresAt ? newExpiresAt.toISOString() : '(never)'}`
        );

        return newToken;
      } catch (error: any) {
        this.logger.error(
          `Failed to refresh offline token for shop ${normalizedShop}: ${error.message}`,
          error.stack
        );
        return null;
      } finally {
        // 释放锁
        this.refreshLocks.delete(normalizedShop);
      }
    })();

    this.refreshLocks.set(normalizedShop, refreshPromise);
    return refreshPromise;
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
   * 获取店铺的 offline access token，过期前自动刷新。
   *
   * @param shop 店铺域名
   * @param forceRefresh 强制刷新（忽略过期检查）
   */
  async getOfflineToken(shop: string, forceRefresh: boolean = false): Promise<string | null> {
    try {
      const normalizedShop = this.normalizeShop(shop);

      const entity = await this.sessionRepository.findOne({
        where: { shop: normalizedShop, sessionType: 'offline' as any },
      });

      if (!entity?.accessToken) {
        return null;
      }

      // 检查是否需要刷新 token
      if (forceRefresh || this.needsRefresh(entity.expiresAt)) {
        if (forceRefresh) {
          this.logger.log(`Force refresh requested for ${normalizedShop}`);
        } else {
          this.logger.log(
            `Token for ${normalizedShop} expires soon ` +
              `(${entity.expiresAt?.toISOString() ?? '(no expiry)'}), refreshing...`
          );
        }

        const newToken = await this.refreshOfflineToken(normalizedShop);
        if (newToken) {
          return newToken;
        }
        // 刷新失败，继续使用旧 token
        this.logger.warn(`Token refresh failed, using existing token for ${normalizedShop}`);
      }

      return entity.accessToken;
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
      const normalizedShop = this.normalizeShop(shop);

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
      const normalizedShop = this.normalizeShop(shop);

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
   * 如果即将过期，会主动刷新。
   */
  async hasValidOfflineToken(shop: string): Promise<boolean> {
    try {
      const normalizedShop = this.normalizeShop(shop);

      const entity = await this.sessionRepository.findOne({
        where: { shop: normalizedShop, sessionType: 'offline' as any },
      });

      if (!entity?.accessToken) return false;

      // 已过期 → 尝试刷新
      if (entity.expiresAt && entity.expiresAt.getTime() < Date.now()) {
        this.logger.log(`Token expired for ${normalizedShop}, attempting refresh...`);
        const newToken = await this.refreshOfflineToken(normalizedShop);
        return !!newToken;
      }

      // 即将过期 → 尝试刷新（不阻塞当前请求判断）
      if (this.needsRefresh(entity.expiresAt)) {
        this.logger.log(`Token for ${normalizedShop} expiring soon, starting background refresh`);
        this.refreshOfflineToken(normalizedShop).catch(() => {
          // 静默失败，getOfflineToken 会在下次请求时再次尝试
        });
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
