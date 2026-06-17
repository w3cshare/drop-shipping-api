import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ShopifySessionService } from '../session/shopify-session.service';

/**
 * Shopify API 守卫。支持三种调用模式共存：
 *
 * 1. 应用内模式（Embedded App）：前端通过 Shopify App Bridge 获取 JWT Session Token
 *    请求头：Authorization: Bearer <app-bridge-jwt>
 *    -> 解析 JWT 中的 dest 字段得到 shop
 *
 * 2. 独立应用模式（Standalone）：前端用后端自定义 JWT 登录，调用 API 时带 shop 参数
 *    请求头：Authorization: Bearer <custom-jwt> （可选，不用于 Shopify API）
 *    查询参数：?shop=xxx.myshopify.com
 *    -> 忽略自定义 JWT（不是 Shopify access token），通过 shop 参数查 offline token
 *
 * 3. 原始 access token 模式：直接携带 Shopify access token
 *    请求头：Authorization: Bearer <shopify-access-token> 或 X-Shopify-Access-Token
 *    查询参数：?shop=xxx.myshopify.com
 *    -> 直接使用提供的 token 调用 Shopify API
 *
 * 最终都会在 request.shopify 上设置 { shop, accessToken }
 * 供下游的 GraphQL/REST Service 调用 Shopify API。
 */
@Injectable()
export class ShopifyAuthGuard implements CanActivate {
  private readonly logger = new Logger(ShopifyAuthGuard.name);

  constructor(private readonly sessionService: ShopifySessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<any>();

    try {
      const authHeader = request.headers['authorization'] as string | undefined;
      const queryShop = request.query.shop as string | undefined;
      const bodyShop = request.body?.shop as string | undefined;

      // 1) 优先处理 App Bridge JWT（应用内模式）
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);

        if (this.looksLikeAppBridgeJwt(token)) {
          const payload = this.parseAppBridgeJwt(token);
          if (payload) {
            request.shopify = { shop: payload.shop, sessionTokenPayload: payload.raw };
            this.logger.debug(`[1] App Bridge JWT 解析成功，shop=${payload.shop}`);
            return true;
          }
        }

        // 2) 可能是原始 Shopify access token（需要配合 shop 参数）
        if (this.looksLikeShopifyAccessToken(token) && queryShop) {
          request.shopify = { shop: queryShop, accessToken: token };
          this.logger.debug(`[2] 使用 Bearer token 作为 Shopify access token，shop=${queryShop}`);
          return true;
        }

        // 3) 不是可识别的 token 格式 —— 可能是独立应用的自定义 JWT
        //    降级：忽略这个 token，继续看 shop 参数
        this.logger.debug(
          `[3] Bearer token 不是 App Bridge JWT 也不是 Shopify access token，` +
            `降级使用 shop 参数查找 offline token`,
        );
      }

      // 4) X-Shopify-Access-Token + shop 参数
      const shopifyToken = request.headers['x-shopify-access-token'] as string | undefined;
      if (shopifyToken) {
        const shop = queryShop || bodyShop;
        if (shop) {
          request.shopify = { shop, accessToken: shopifyToken };
          this.logger.debug(`[4] 使用 X-Shopify-Access-Token，shop=${shop}`);
          return true;
        }
        throw new UnauthorizedException('X-Shopify-Access-Token requires shop parameter');
      }

      // 5) ?shop=xxx 查询参数：查数据库 offline token
      if (queryShop) {
        const token = await this.sessionService.getOfflineToken(queryShop);
        if (!token) {
          throw new UnauthorizedException(`No offline token for shop: ${queryShop}`);
        }
        request.shopify = { shop: queryShop, accessToken: token };
        this.logger.debug(`[5] 使用 shop 参数查找 offline token，shop=${queryShop}`);
        return true;
      }

      // 6) body.shop 字段
      if (bodyShop) {
        const token = await this.sessionService.getOfflineToken(bodyShop);
        if (!token) {
          throw new UnauthorizedException(`No offline token for shop: ${bodyShop}`);
        }
        request.shopify = { shop: bodyShop, accessToken: token };
        this.logger.debug(`[6] 使用 body.shop 查找 offline token，shop=${bodyShop}`);
        return true;
      }

      throw new UnauthorizedException(
        'No valid authentication provided: need App Bridge JWT, or ?shop=xxx, or X-Shopify-Access-Token',
      );
    } catch (error: any) {
      this.logger.warn(`Shopify authentication failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * 判断是否可能是 App Bridge JWT：三段 base64 结构 + payload 有 dest 字段
   */
  private looksLikeAppBridgeJwt(token: string): boolean {
    if (!token) return false;
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    // JWT 只包含 base64url 字符
    return /^[A-Za-z0-9\-_=.]+$/.test(parts[0]) && parts[1].length > 10;
  }

  /**
   * 解析 App Bridge JWT，提取 dest 作为 shop
   */
  private parseAppBridgeJwt(token: string): { shop: string; raw: any } | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;

      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
      if (!payload.dest) return null;

      const shop = (payload.dest as string).replace(/^https?:\/\//, '').replace(/\/$/, '');
      return { shop, raw: payload };
    } catch {
      return null;
    }
  }

  /**
   * 判断是否看起来像 Shopify access token：
   * 典型的是 shp / shpat / shua / shpca 等前缀的长字符串，
   * 或纯随机的 hex/base64 字符串。
   */
  private looksLikeShopifyAccessToken(token: string): boolean {
    if (!token || token.length < 10) return false;
    // Shopify 常见前缀
    if (/^(shp|shpat|shua|shpca|shpta)_/i.test(token)) return true;
    // 很长的随机字符串也可能是 access token（≥ 20 字符且不是 JWT 三段式）
    const parts = token.split('.');
    if (parts.length !== 3 && token.length >= 20) return true;
    return false;
  }
}
