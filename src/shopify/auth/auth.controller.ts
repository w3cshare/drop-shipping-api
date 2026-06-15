import {
  Controller,
  Get,
  Query,
  Req,
  Res,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Session } from '@shopify/shopify-api';
import { ShopifyModule } from '../shopify.module';
import { ShopifySessionService } from '../session/shopify-session.service';
import { WebhookRegistrationService } from '../../webhooks/webhook-registration.service';

/**
 * 使用官方 @shopify/shopify-api 完成 OAuth 授权流程。
 *
 * 路由：
 *   GET /auth/login?shop=xxx          → 发起 OAuth 授权（默认 online token）
 *   GET /auth/install?shop=xxx        → 强制重新授权（忽略现有 token）
 *   GET /auth/status?shop=xxx         → 查看当前授权状态、scopes、过期时间
 *   GET /auth/callback                → Shopify 回调（online token）
 *   GET /auth/offline-callback        → Shopify 回调（offline token）
 */
@Controller('auth')
export class ShopifyAuthController {
  private readonly logger = new Logger(ShopifyAuthController.name);

  constructor(
    private readonly sessionService: ShopifySessionService,
    private readonly webhookRegistrationService: WebhookRegistrationService,
  ) {}

  /**
   * 检查店铺授权状态。无需登录即可调用。
   *
   * 返回字段：
   *   shop, hasToken, scopesMatch, missingScopes, storedScopes,
   *   requiredScopes, expiresAt, updatedAt, needsReauth, hint
   */
  @Get('status')
  async getAuthStatus(@Query('shop') shop: string) {
    try {
      if (!shop) {
        throw new HttpException('Missing shop parameter', HttpStatus.BAD_REQUEST);
      }

      const sanitizedShop = this.sanitizeShop(shop);
      if (!sanitizedShop) {
        throw new HttpException('Invalid shop domain', HttpStatus.BAD_REQUEST);
      }

      const requiredScopes = ShopifyModule.scopes;
      const sessionInfo = await this.sessionService.getOfflineSessionInfo(sanitizedShop);
      const scopeCheck = await this.sessionService.checkScopes(sanitizedShop, requiredScopes);
      const hasValidToken = await this.sessionService.hasValidOfflineToken(sanitizedShop);

      const needsReauth = !hasValidToken || !scopeCheck.ok;
      let hint: string | undefined;

      if (!sessionInfo) {
        hint = '该店铺尚未授权。请访问 /auth/install?shop= 开始安装流程。';
      } else if (!hasValidToken) {
        hint = 'Token 已过期或无效。请访问 /auth/install?shop= 重新授权。';
      } else if (!scopeCheck.ok) {
        hint = `当前 token 缺少 scope(s): ${scopeCheck.missingScopes.join(', ')}。请访问 /auth/install?shop= 重新授权。`;
      } else {
        hint = '授权状态良好。scopes 完整，token 有效。';
      }

      return {
        shop: sanitizedShop,
        hasToken: hasValidToken,
        scopesMatch: scopeCheck.ok,
        missingScopes: scopeCheck.missingScopes,
        storedScopes: scopeCheck.storedScopes,
        requiredScopes,
        expiresAt: sessionInfo?.expiresAt ?? null,
        updatedAt: sessionInfo?.updatedAt ?? null,
        needsReauth,
        hint,
      };
    } catch (error: any) {
      this.logger.error(`Status check failed: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Status check failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 发起 OAuth 授权（默认 online token 优先）。
   *
   * 如果该店铺已有合法 offline token 且 scopes 完整，
   * 会直接跳转回应用首页，避免不必要的重授权。
   */
  @Get('login')
  async login(
    @Query('shop') shop: string,
    @Query('force') force: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    try {
      this.logger.log(`=== /auth/login called === shop=${shop}, force=${force}`);

      if (!shop) {
        throw new HttpException('Missing shop parameter', HttpStatus.BAD_REQUEST);
      }

      const sanitizedShop = this.sanitizeShop(shop);
      if (!sanitizedShop) {
        throw new HttpException('Invalid shop domain', HttpStatus.BAD_REQUEST);
      }

      const requiredScopes = ShopifyModule.scopes;

      // 如果没有传 force=1，先检查是否需要重授权
      if (force !== '1') {
        this.logger.log(`Checking existing token for ${sanitizedShop}...`);
        const hasValidToken = await this.sessionService.hasValidOfflineToken(sanitizedShop);
        const scopeCheck = await this.sessionService.checkScopes(sanitizedShop, requiredScopes);

        this.logger.log(
          `Token check result: hasValidToken=${hasValidToken}, ` +
            `scopeCheck.ok=${scopeCheck.ok}, storedScopes=${scopeCheck.storedScopes.join(',')}, ` +
            `missingScopes=${scopeCheck.missingScopes.join(',')}`,
        );

        if (hasValidToken && scopeCheck.ok) {
          this.logger.log(`Shop ${sanitizedShop} already authorized, skipping OAuth`);
          return res.redirect(`/?shop=${sanitizedShop}`);
        }
        this.logger.log(`Shop ${sanitizedShop} needs auth, initiating OAuth...`);
      } else {
        this.logger.log(`Force mode: initiating OAuth without token check`);
      }

      // 发起 online token OAuth 授权
      return this.beginOAuth(sanitizedShop, req, res, true, '/auth/callback');
    } catch (error: any) {
      this.logger.error(`Login failed: ${error.message}`, error.stack);
      throw new HttpException(
        `Authentication failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 强制重新授权（忽略现有 token）。等价于 /auth/login?shop=xxx&force=1。
   */
  @Get('install')
  async install(
    @Query('shop') shop: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    this.logger.log(`Force install requested for shop: ${shop}`);
    return this.login(shop, '1', req, res);
  }

  /**
   * Shopify OAuth 回调（online token）。
   * 处理完后自动发起 offline token 授权，最后回到应用首页。
   */
  @Get('callback')
  async callback(@Req() req: Request, @Res() res: Response) {
    try {
      const shopify = ShopifyModule.shopify;

      this.logger.log(`Processing OAuth online callback`);

      const callback = await shopify.auth.callback({ rawRequest: req, rawResponse: res });
      const session = callback.session;
      const shop = session.shop;

      // 手动保存 session 到数据库
      this.logger.log(`Saving online session for shop: ${shop}`);
      const storeResult = await this.sessionService.storeSession(session);
      this.logger.log(`Online session save result: ${storeResult}`);

      this.logger.log(
        `Online token stored for shop: ${shop}, ` +
          `scopes: ${session.scope || '(empty)'}`,
      );

      // 已经有 offline token 且 scopes 完整 → 直接回首页
      const hasValid = await this.sessionService.hasValidOfflineToken(shop);
      const scopeCheck = await this.sessionService.checkScopes(shop, ShopifyModule.scopes);
      if (hasValid && scopeCheck.ok) {
        this.logger.log(`Shop ${shop} has valid offline token, finalizing auth flow`);
        return res.redirect(`/?shop=${shop}`);
      }

      // 发起 offline token 授权
      this.logger.log(
        `Redirecting to offline OAuth for shop: ${shop} ` +
          `(hasValid=${hasValid}, missingScopes=${scopeCheck.missingScopes.join(',')})`,
      );

      return this.beginOAuth(shop, req, res, false, '/auth/offline-callback');
    } catch (error: any) {
      this.logger.error(`Online callback failed: ${error.message}`, error.stack);
      throw new HttpException(
        `Authentication callback failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Shopify OAuth 回调（offline token）。完成后回到应用首页。
   * 同时自动注册 Webhook。
   */
  @Get('offline-callback')
  async offlineCallback(@Req() req: Request, @Res() res: Response) {
    try {
      const shopify = ShopifyModule.shopify;

      this.logger.log(`Processing OAuth offline callback`);

      const callback = await shopify.auth.callback({ rawRequest: req, rawResponse: res });
      const session = callback.session;
      const shop = session.shop;

      // 手动保存 session 到数据库
      this.logger.log(`Saving offline session for shop: ${shop}`);
      const storeResult = await this.sessionService.storeSession(session);
      this.logger.log(`Offline session save result: ${storeResult}`);

      this.logger.log(
        `Offline token stored for shop: ${shop}, ` +
          `scopes: ${session.scope || '(empty)'}`,
      );

      // 自动注册 Webhook
      const host = ShopifyModule.host;
      if (host) {
        this.logger.log(`Registering webhooks for ${shop}...`);
        const result = await this.webhookRegistrationService.registerWebhooks(shop, host);
        this.logger.log(
          `Webhook registration result: ${result.registered.length} registered, ` +
            `${result.existing.length} existing, ${result.failed.length} failed`,
        );
      }

      return res.redirect(`/?shop=${shop}`);
    } catch (error: any) {
      this.logger.error(`Offline callback failed: ${error.message}`, error.stack);
      throw new HttpException(
        `Offline authentication failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 手动注册 Webhook（用于调试或重新注册）。
   */
  @Get('webhooks/register')
  async registerWebhooks(@Query('shop') shop: string) {
    try {
      if (!shop) {
        throw new HttpException('Missing shop parameter', HttpStatus.BAD_REQUEST);
      }

      const sanitizedShop = this.sanitizeShop(shop);
      if (!sanitizedShop) {
        throw new HttpException('Invalid shop domain', HttpStatus.BAD_REQUEST);
      }

      const host = ShopifyModule.host;
      if (!host) {
        throw new HttpException('SHOPIFY_HOST not configured', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      const result = await this.webhookRegistrationService.registerWebhooks(sanitizedShop, host);

      return {
        success: true,
        shop: sanitizedShop,
        registered: result.registered,
        existing: result.existing,
        failed: result.failed,
        total: result.registered.length + result.existing.length,
      };
    } catch (error: any) {
      this.logger.error(`Webhook registration failed: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Webhook registration failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 查询已注册的 Webhook 列表。
   */
  @Get('webhooks/list')
  async listWebhooks(@Query('shop') shop: string) {
    try {
      if (!shop) {
        throw new HttpException('Missing shop parameter', HttpStatus.BAD_REQUEST);
      }

      const sanitizedShop = this.sanitizeShop(shop);
      if (!sanitizedShop) {
        throw new HttpException('Invalid shop domain', HttpStatus.BAD_REQUEST);
      }

      const webhooks = await this.webhookRegistrationService.listWebhooks(sanitizedShop);

      return {
        success: true,
        shop: sanitizedShop,
        count: webhooks.length,
        webhooks,
      };
    } catch (error: any) {
      this.logger.error(`Failed to list webhooks: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to list webhooks: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 统一构建 OAuth URL 并发起重定向。
   */
  private async beginOAuth(
    shop: string,
    req: Request,
    res: Response,
    isOnline: boolean,
    callbackPath: string,
  ) {
    const shopify = ShopifyModule.shopify;
    const host = ShopifyModule.host;

    // 计算最终 redirect_uri（与 shopify-api 内部拼接逻辑一致）
    const normalizedHost = host.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const redirectUri = `https://${normalizedHost}${callbackPath}`;

    this.logger.log(
      `beginOAuth: shop=${shop}, isOnline=${isOnline}, callbackPath=${callbackPath}, ` +
        `SHOPIFY_HOST=${host}, normalizedHost=${normalizedHost}, ` +
        `redirect_uri=${redirectUri}, scopes=${ShopifyModule.scopesString}`,
    );

    const authUrl = await shopify.auth.begin({
      shop,
      callbackPath,
      isOnline,
      rawRequest: req,
      rawResponse: res,
    });

    // shopify-api 可能已经通过 rawResponse 发送了重定向
    if (res.headersSent) return;

    // 否则，手动重定向
    if (typeof authUrl === 'string' && authUrl.startsWith('http')) {
      this.logger.log(`Redirecting to Shopify OAuth: ${authUrl.substring(0, 120)}...`);
      return res.redirect(authUrl);
    }

    this.logger.warn(`Unexpected auth.begin response: ${JSON.stringify(authUrl)}`);
    return res.redirect(`/?shop=${shop}`);
  }

  private sanitizeShop(shop: string): string | null {
    if (!shop) return null;
    let sanitized = shop.toLowerCase().trim();
    sanitized = sanitized.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const shopRegex = /^[a-z0-9][a-z0-9\-]*\.myshopify\.com$/;
    if (!shopRegex.test(sanitized)) return null;
    return sanitized;
  }

  /**
   * 诊断端点：模拟保存 session 并显示 OAuth 配置，用于排错
   */
  @Get('debug')
  async debug(@Query('shop') shop: string) {
    try {
      const sanitizedShop = this.sanitizeShop(shop) || 'test-shop.myshopify.com';

      this.logger.log(`=== /auth/debug === shop=${sanitizedShop}`);

      // 模拟一个 Session 对象并保存
      const testSession = new Session({
        id: `${sanitizedShop}_offline`,
        shop: sanitizedShop,
        state: 'debug-test',
        isOnline: false,
        accessToken: 'shpua_debug_test_token_' + Date.now(),
        scope: ShopifyModule.scopesString || 'read_products',
      });

      const saveResult = await this.sessionService.storeSession(testSession);
      this.logger.log(`Debug: storeSession returned ${saveResult}`);

      // 重新读取确认
      const hasValid = await this.sessionService.hasValidOfflineToken(sanitizedShop);
      const info = await this.sessionService.getOfflineSessionInfo(sanitizedShop);
      const token = await this.sessionService.getOfflineToken(sanitizedShop);

      const host = ShopifyModule.host;
      const normalizedHost = host.replace(/^https?:\/\//, '').replace(/\/$/, '');

      return {
        success: true,
        message: 'Diagnostic session saved',
        storeResult: saveResult,
        hasValidOfflineToken: hasValid,
        tokenExists: !!token,
        token: token ? token.substring(0, 20) + '...' : null,
        sessionInfo: info,
        // OAuth 配置
        '---OAuth配置---': '---',
        SHOPIFY_HOST: host,
        normalizedHost,
        apiKey: ShopifyModule.apiKey ? ShopifyModule.apiKey.substring(0, 10) + '...' : '(empty)',
        scopes: ShopifyModule.scopes,
        scopesString: ShopifyModule.scopesString,
        redirectUri_online: `https://${normalizedHost}/auth/callback`,
        redirectUri_offline: `https://${normalizedHost}/auth/offline-callback`,
        '---在Partner后台需要添加的redirect_uri---': [
          `https://${normalizedHost}/auth/callback`,
          `https://${normalizedHost}/auth/offline-callback`,
        ],
      };
    } catch (error: any) {
      this.logger.error(`Debug failed: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
