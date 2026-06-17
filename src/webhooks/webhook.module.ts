import { Module, NestModule, MiddlewareConsumer, forwardRef } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { WebhookHmacMiddleware } from './hmac.middleware';
import { WebhookRegistrationService } from './webhook-registration.service';
import { ShopifyModule } from '../shopify/shopify.module';
import { OrdersModule } from '../orders/order.module';
import { ProductsModule } from '../products/products.module';

/**
 * Webhook 模块
 *
 * 仅对 /webhooks 路由应用 HMAC 验证中间件
 * 确保所有 Webhook 请求都经过严格的安全验证
 */
@Module({
  imports: [forwardRef(() => ShopifyModule), OrdersModule, forwardRef(() => ProductsModule)],
  controllers: [WebhookController],
  providers: [WebhookHmacMiddleware, WebhookRegistrationService],
  exports: [WebhookRegistrationService],
})
export class WebhookModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // 对所有 /webhooks 路径应用 HMAC 验证中间件
    consumer
      .apply(WebhookHmacMiddleware)
      .forRoutes('webhooks');
  }
}