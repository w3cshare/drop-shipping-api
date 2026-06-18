import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderService } from './order.service';
import { OrdersController } from './orders.controller';
import { ShopOrderEntity } from '../database/entities/order.entity';
import { ShopifyModule } from '../shopify/shopify.module';

@Module({
  imports: [TypeOrmModule.forFeature([ShopOrderEntity]), forwardRef(() => ShopifyModule)],
  providers: [OrderService],
  controllers: [OrdersController],
  exports: [OrderService],
})
export class OrdersModule {}
