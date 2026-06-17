import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductService } from './product.service';
import { ProductsController } from './products.controller';
import { ShopProductEntity } from '../database/entities/product.entity';
import { ShopifyModule } from '../shopify/shopify.module';
import { ShopModule } from '../shop/shop.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [TypeOrmModule.forFeature([ShopProductEntity]), forwardRef(() => ShopifyModule), forwardRef(() => BillingModule), ShopModule],
  providers: [ProductService],
  controllers: [ProductsController],
  exports: [ProductService],
})
export class ProductsModule {}
