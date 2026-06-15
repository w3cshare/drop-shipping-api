import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ShopifySessionService } from '../session/shopify-session.service';

/**
 * 简化版 Shopify API 守卫。
 *
 * 使用 shopify-api 官方包已经内置了 HMAC/state 校验。
 * 本 Guard 主要用于：
 * 1) Bearer token 携带 shopify_app_bridge 或其他前端调用时，
 *    通过 JWT Session Token 解析 shop 信息。
 * 2) 通过 ?shop=xxx 查询参数，校验 offline token 是否存在。
 */
@Injectable()
export class ShopifyAuthGuard implements CanActivate {
  private readonly logger = new Logger(ShopifyAuthGuard.name);

  constructor(private readonly sessionService: ShopifySessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<any>();

    try {
      const authHeader = request.headers['authorization'] as string;

      // 1) Bearer token - 尝试多种解析方式
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        
        // 1a) 尝试解析为 Shopify App Bridge JWT Session Token
        try {
          this.validateSessionToken(token, request);
          return true;
        } catch (sessionTokenError) {
          this.logger.debug(`Session token validation failed, trying as raw access token: ${sessionTokenError.message}`);
        }
        
        // 1b) 尝试直接作为 access token 使用（需要同时提供 shop 参数）
        const shop = request.query.shop as string;
        if (shop) {
          request.shopify = { shop, accessToken: token };
          this.logger.debug(`Using direct access token for shop: ${shop}`);
          return true;
        }
      }

      // 2) X-Shopify-Access-Token 请求头（推荐的标准方式）
      const shopifyToken = request.headers['x-shopify-access-token'] as string;
      if (shopifyToken) {
        const shop = request.query.shop as string || request.body?.shop as string;
        if (shop) {
          request.shopify = { shop, accessToken: shopifyToken };
          this.logger.debug(`Using X-Shopify-Access-Token for shop: ${shop}`);
          return true;
        }
        throw new UnauthorizedException('X-Shopify-Access-Token requires shop parameter');
      }

      // 3) ?shop=xxx 查询参数 (自动从数据库获取 offline token)
      const shop = request.query.shop as string;
      if (shop) {
        const token = await this.sessionService.getOfflineToken(shop);
        if (!token) {
          throw new UnauthorizedException('No offline token for shop');
        }
        request.shopify = { shop, accessToken: token };
        return true;
      }

      // 4) body.shop 字段
      const bodyShop = request.body?.shop as string;
      if (bodyShop) {
        const token = await this.sessionService.getOfflineToken(bodyShop);
        if (!token) {
          throw new UnauthorizedException('No offline token for shop');
        }
        request.shopify = { shop: bodyShop, accessToken: token };
        return true;
      }

      throw new UnauthorizedException('No valid authentication provided');
    } catch (error: any) {
      this.logger.warn(`Authentication failed: ${error.message}`);
      throw error;
    }
  }

  private validateSessionToken(token: string, request: any): void {
    try {
      // JWT payload 结构：
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid session token format');
      }
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));

      if (!payload.dest) {
        throw new Error('Invalid session token: missing dest');
      }
      const shop = (payload.dest as string).replace(/^https?:\/\//, '').replace(/\/$/, '');
      request.shopify = { shop, sessionTokenPayload: payload };
    } catch (error: any) {
      throw new UnauthorizedException('Invalid session token');
    }
  }
}
