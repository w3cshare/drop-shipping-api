import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../database/entities/user.entity';
import { UserShopEntity } from '../database/entities/user-shop.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UserAuthModule } from '../auth/user-auth.module';
import { ShopModule } from '../shop/shop.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, UserShopEntity]),
    forwardRef(() => UserAuthModule),
    ShopModule,
  ],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
