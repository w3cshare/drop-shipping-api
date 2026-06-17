import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderSyncService } from './order-sync.service';
import { ProductSyncService } from './product-sync.service';
import { SyncScheduler } from './sync-scheduler';
import { SyncRecordEntity } from '../database/entities/sync-record.entity';
import { ShopSessionEntity } from '../database/entities/shop-session.entity';
import { OrdersModule } from '../orders/order.module';
import { ProductsModule } from '../products/products.module';
import { ShopifyModule } from '../shopify/shopify.module';
import { WebhookModule } from '../webhooks/webhook.module';

/**
 * 同步模块
 *
 * 负责订单和商品的三层补偿机制：
 * 1. Webhook 实时接收 -> 写入队列 -> WebhookEventProcessor 异步处理
 * 2. SyncScheduler 定时轮询队列 -> 处理积压事件
 * 3. OrderSyncService/ProductSyncService 定时 REST API 全量同步 -> 兜底补偿缺失数据
 *
 * 提供：
 * - OrderSyncService：订单同步（REST API 兜底）
 * - ProductSyncService：商品同步（REST API 兜底）
 * - SyncScheduler：定时同步任务调度
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([SyncRecordEntity, ShopSessionEntity]),
    forwardRef(() => ShopifyModule),
    forwardRef(() => OrdersModule),
    forwardRef(() => ProductsModule),
    forwardRef(() => WebhookModule),
  ],
  providers: [OrderSyncService, ProductSyncService, SyncScheduler],
  exports: [OrderSyncService, ProductSyncService, SyncScheduler],
})
export class SyncModule {}