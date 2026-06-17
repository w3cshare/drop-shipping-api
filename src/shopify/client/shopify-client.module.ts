import { Module, forwardRef } from '@nestjs/common';
import { ShopifyClientController } from './shopify-client.controller';
import { ShopifyClientService } from './shopify-client.service';
import { ShopifyModule } from '../shopify.module';
import { ShopModule } from '../../shop/shop.module';

/**
 * REST API 测试模块
 *
 * 提供 REST API 测试接口，用于验证 ShopifyClientService 的功能
 */
@Module({
  imports: [forwardRef(() => ShopifyModule), ShopModule],
  controllers: [ShopifyClientController],
  providers: [ShopifyClientService],
  exports: [ShopifyClientService],
})
export class ShopifyClientModule {}
