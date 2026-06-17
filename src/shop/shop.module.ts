import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShopEntity } from '../database/entities/shop.entity';
import { UserShopEntity } from '../database/entities/user-shop.entity';
import { ShopService } from './shop.service';
import { ShopController } from './shop.controller';
import { ShopifyModule } from '../shopify/shopify.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ShopEntity, UserShopEntity]),
    forwardRef(() => ShopifyModule),
  ],
  providers: [ShopService],
  controllers: [ShopController],
  exports: [ShopService],
})
export class ShopModule {}
