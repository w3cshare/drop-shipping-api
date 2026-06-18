import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductService } from './product.service';
import { ProductsController } from './products.controller';
import { ShopProductEntity } from '../database/entities/product.entity';
import { ShopifyModule } from '../shopify/shopify.module';

@Module({
  imports: [TypeOrmModule.forFeature([ShopProductEntity]), forwardRef(() => ShopifyModule)],
  providers: [ProductService],
  controllers: [ProductsController],
  exports: [ProductService],
})
export class ProductsModule {}
