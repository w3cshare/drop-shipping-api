import { Module, OnModuleInit, Logger, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  shopifyApi,
  ApiVersion,
  LogSeverity,
} from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';
import { ShopifySessionService } from './session/shopify-session.service';
import { ShopifyAuthController } from './auth/auth.controller';
import { ShopifyAuthGuard } from './auth/auth.guard';
import { ShopifyGraphqlService } from './graphql/graphql.service';
import { ShopifyClientService } from './client/shopify-client.service';
import { ShopSessionEntity } from '../database/entities/shop-session.entity';
import { WebhookModule } from '../webhooks/webhook.module';

/**
 * Shopify 核心模块。
 *
 * 在模块初始化期间创建一个全局可访问的 shopifyApi 上下文实例，
 * 该实例绑定到由数据库实现的自定义 SessionStorage。
 *
 * 该实例作为模块级单例通过 getShopify() 暴露给其他服务使用。
 */
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([ShopSessionEntity]),
    forwardRef(() => WebhookModule),
  ],
  controllers: [ShopifyAuthController],
  providers: [
    ShopifySessionService,
    ShopifyAuthGuard,
    ShopifyGraphqlService,
    ShopifyClientService,
  ],
  exports: [
    ShopifySessionService,
    ShopifyAuthGuard,
    ShopifyGraphqlService,
    ShopifyClientService,
  ],
})
export class ShopifyModule implements OnModuleInit {
  private readonly logger = new Logger(ShopifyModule.name);
  private static _scopes: string[] = [];
  private static _apiKey: string = '';
  private static _host: string = '';

  constructor(
    private readonly configService: ConfigService,
    private readonly sessionService: ShopifySessionService,
  ) {}

  async onModuleInit() {
    try {
      const apiKey = this.configService.get<string>('SHOPIFY_API_KEY');
      const apiSecret = this.configService.get<string>('SHOPIFY_API_SECRET');
      const host = this.configService.get<string>('SHOPIFY_HOST');
      const scopesRaw = this.configService.get<string>('SHOPIFY_SCOPES');
      const apiVersion = (this.configService.get<string>('SHOPIFY_API_VERSION') ||
        ApiVersion.October24) as ApiVersion;

      if (!apiKey || !apiSecret || !host) {
        throw new Error(
          'Missing required Shopify configuration: SHOPIFY_API_KEY / SHOPIFY_API_SECRET / SHOPIFY_HOST',
        );
      }

      const scopes = scopesRaw ? scopesRaw.split(',').map((s) => s.trim()) : [];
      const hostName = host.replace(/^https?:\/\//, '').replace(/\/$/, '');

      // 保存到静态属性，供 controller 使用
      ShopifyModule._scopes = scopes;
      ShopifyModule._apiKey = apiKey;
      ShopifyModule._host = host;

      this.logger.debug(`Initializing shopifyApi with host=${hostName}, apiKey=${apiKey?.substring(0, 10)}...`);
      this.logger.log(`Scopes configured: ${scopes.join(', ')}`);

      const shopify = shopifyApi({
        apiKey,
        apiSecretKey: apiSecret,
        scopes,
        hostName,
        apiVersion,
        isEmbeddedApp: true,
        sessionStorage: this.sessionService.getSessionStorage(),
        logger: {
          log: (severity, message) => {
            if (severity === LogSeverity.Error) {
              this.logger.error(`[Shopify] ${message}`);
            } else if (severity === LogSeverity.Warning) {
              this.logger.warn(`[Shopify] ${message}`);
            } else if (severity === LogSeverity.Debug) {
              this.logger.debug(`[Shopify] ${message}`);
            } else {
              this.logger.log(`[Shopify] ${message}`);
            }
          },
          level: LogSeverity.Info,
        },
      });

      (ShopifyModule as any)._shopify = shopify;

      this.logger.log(`Shopify context initialized (host=${hostName}, version=${apiVersion})`);
    } catch (error: any) {
      this.logger.error(`Failed to initialize Shopify context: ${error.message}`, error.stack);
      throw error;
    }
  }

  /** 获取全局可用的 shopify-api 实例。仅在模块初始化后有效。 */
  static get shopify(): ReturnType<typeof shopifyApi> {
    const instance = (ShopifyModule as any)._shopify;
    if (!instance) {
      throw new Error('Shopify module not initialized yet');
    }
    return instance;
  }

  /** 当前配置的 OAuth scopes 列表。 */
  static get scopes(): string[] {
    return ShopifyModule._scopes;
  }

  /** 当前配置的 OAuth scopes 字符串（逗号分隔）。 */
  static get scopesString(): string {
    return ShopifyModule._scopes.join(',');
  }

  /** Shopify API Key（Client ID）。 */
  static get apiKey(): string {
    return ShopifyModule._apiKey;
  }

  /** Shopify HOST 配置（如 auth2.s7.tunnelfrp.com）。 */
  static get host(): string {
    return ShopifyModule._host;
  }
}
