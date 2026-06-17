import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderService } from './order.service';
import { OrderSyncService } from './order-sync.service';
import { SyncScheduler } from './sync-scheduler';
import { ShopOrderEntity } from '../database/entities/order.entity';
import { SyncRecordEntity } from '../database/entities/sync-record.entity';
import { ShopSessionEntity } from '../database/entities/shop-session.entity';
import { ShopifyModule } from '../shopify/shopify.module';
import { WebhookModule } from '../webhooks/webhook.module';
import { OrdersController } from './orders.controller';

/**
 * 订单模块
 *
 * 三层补偿机制：
 * 1. Webhook 实时接收 → 写入队列 → WebhookEventProcessor 异步处理
 * 2. SyncScheduler 定时轮询队列 → 处理积压事件
 * 3. OrderSyncService 定时 REST API 全量同步 → 兜底补偿缺失订单
 *
 * 提供：
 * - OrderService：订单 CRUD 操作
 * - OrderSyncService：订单同步（REST API 兜底）
 * - SyncScheduler：定时同步任务调度
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ShopOrderEntity, SyncRecordEntity, ShopSessionEntity]),
    forwardRef(() => ShopifyModule),
    forwardRef(() => WebhookModule),
  ],
  providers: [OrderService, OrderSyncService, SyncScheduler],
  controllers: [OrdersController],
  exports: [OrderService, OrderSyncService, SyncScheduler],
})
export class OrdersModule {}
