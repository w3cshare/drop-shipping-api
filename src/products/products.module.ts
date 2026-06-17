import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductService } from './product.service';
import { ProductsController } from './products.controller';
import { ShopProductEntity } from '../database/entities/product.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ShopProductEntity])],
  providers: [ProductService],
  controllers: [ProductsController],
  exports: [ProductService],
})
export class ProductsModule {}
