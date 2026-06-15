import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ShopifyModule } from '../shopify/shopify.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [ShopifyModule, BillingModule],
  controllers: [ProductsController],
})
export class ProductsModule {}