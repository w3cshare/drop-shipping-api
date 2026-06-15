import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderService } from './order.service';
import { ShopOrderEntity } from '../database/entities/order.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ShopOrderEntity])],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrdersModule {}