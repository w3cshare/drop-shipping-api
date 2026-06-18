import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderService } from './order.service';
import { ShopOrderEntity } from '../database/entities/order.entity';
import { ShopifyModule } from '../shopify/shopify.module';
import { SyncModule } from '../sync/sync.module';
import { OrdersController } from './orders.controller';

/**
 * 订单模块
 *
 * 提供：
 * - OrderService：订单 CRUD 操作
 * - OrdersController：订单查询接口
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ShopOrderEntity]),
    forwardRef(() => ShopifyModule),
    forwardRef(() => SyncModule),
  ],
  providers: [OrderService],
  controllers: [OrdersController],
  exports: [OrderService],
})
export class OrdersModule {}
