import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { ShopifyModule } from '../shopify/shopify.module';

@Module({
  imports: [ShopifyModule],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}