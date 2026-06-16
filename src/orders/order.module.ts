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
 * 提供：
 * - OrderService：订单 CRUD 操作
 * - OrderSyncService：订单同步（补偿机制）
 * - SyncScheduler：定时同步任务
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
