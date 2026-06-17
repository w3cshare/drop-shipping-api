import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderService } from './order.service';
import { OrdersController } from './orders.controller';
import { ShopOrderEntity } from '../database/entities/order.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ShopOrderEntity])],
  providers: [OrderService],
  controllers: [OrdersController],
  exports: [OrderService],
})
export class OrdersModule {}
