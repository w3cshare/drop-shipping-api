import { Module, NestModule, MiddlewareConsumer, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhookController } from './webhook.controller';
import { WebhookHmacMiddleware } from './hmac.middleware';
import { WebhookRegistrationService } from './webhook-registration.service';
import { WebhookQueueService } from './webhook-queue.service';
import { WebhookEventProcessor } from './webhook-event-processor';
import { ShopifyModule } from '../shopify/shopify.module';
import { OrdersModule } from '../orders/order.module';
import { ProductsModule } from '../products/products.module';
import { SyncModule } from '../sync/sync.module';
import { PendingEventEntity } from '../database/entities/pending-event.entity';
import { SyncRecordEntity } from '../database/entities/sync-record.entity';



/**
 * Webhook 模块
 *
 * 可靠性设计：
 * 1. Webhook 收到后立即写入 MySQL 队列
 * 2. WebhookEventProcessor 异步处理队列中的事件
 * 3. SyncScheduler 定时补偿同步缺失的数据
 *
 * 安全设计：
 * 仅对 /webhooks 路由应用 HMAC 验证中间件
 * 确保所有 Webhook 请求都经过严格的安全验证
 */
@Module({
  imports: [
    forwardRef(() => ShopifyModule),
    forwardRef(() => OrdersModule),
    forwardRef(() => ProductsModule),
    forwardRef(() => SyncModule),
    TypeOrmModule.forFeature([PendingEventEntity, SyncRecordEntity]),
  ],
  controllers: [WebhookController],
  providers: [
    WebhookHmacMiddleware,
    WebhookRegistrationService,
    WebhookQueueService,
    WebhookEventProcessor,
  ],
  exports: [
    WebhookRegistrationService,
    WebhookQueueService,
  ],
})
export class WebhookModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // 对所有 /webhooks 路径应用 HMAC 验证中间件
    consumer
      .apply(WebhookHmacMiddleware)
      .forRoutes('webhooks');
  }
}
