import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductService } from './product.service';
import { ProductsController } from './products.controller';
import { ShopProductEntity } from '../database/entities/product.entity';
import { ShopifyModule } from '../shopify/shopify.module';
import { BillingModule } from '../billing/billing.module';
import { SyncModule } from '../sync/sync.module';

/**
 * 商品模块
 *
 * 提供：
 * - ProductService：商品 CRUD 操作
 * - ProductsController：商品查询接口 + 同步管理接口
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ShopProductEntity]),
    forwardRef(() => ShopifyModule),
    forwardRef(() => BillingModule),
    forwardRef(() => SyncModule),
  ],
  providers: [ProductService],
  controllers: [ProductsController],
  exports: [ProductService],
})
export class ProductsModule {}