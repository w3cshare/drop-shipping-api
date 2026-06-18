import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ShopifyModule } from './shopify/shopify.module';
import { WebhookModule } from './webhooks/webhook.module';
import { BillingModule } from './billing/billing.module';
import { OrdersModule } from './orders/order.module';
import { ProductsModule } from './products/products.module';
import { SyncModule } from './sync/sync.module';
import { RedisModule } from './database/redis/redis.module';
import { ShopSessionEntity } from './database/entities/shop-session.entity';
import { ShopOrderEntity } from './database/entities/order.entity';
import { PendingEventEntity } from './database/entities/pending-event.entity';
import { SyncRecordEntity } from './database/entities/sync-record.entity';
import { ShopProductEntity } from './database/entities/product.entity';
import { UserEntity } from './database/entities/user.entity';
import { ShopEntity } from './database/entities/shop.entity';
import { UserShopEntity } from './database/entities/user-shop.entity';
import { UserAuthModule } from './auth/user-auth.module';
import { ShopModule } from './shop/shop.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local', '.env.development', '.env.production'],
    }),

    // 启用 NestJS 内置定时任务调度
    ScheduleModule.forRoot(),

    // TypeORM Database - supports mysql (default) and sqlite via DB_TYPE env var
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const isProduction = configService.get<string>('NODE_ENV') === 'production';
        const dbType = configService.get<string>('DB_TYPE', 'mysql');
        const entities = [ShopSessionEntity, ShopOrderEntity, ShopProductEntity, UserEntity, ShopEntity, UserShopEntity, PendingEventEntity, SyncRecordEntity];

        if (dbType === 'sqlite') {
          return {
            type: 'sqlite',
            database: configService.get<string>('DB_SQLITE_DATABASE', 'shopify_app.db'),
            entities,
            synchronize: true,
            logging: !isProduction,
          };
        }

        return {
          type: 'mysql',
          host: configService.get<string>('DB_HOST', 'localhost'),
          port: configService.get<number>('DB_PORT', 3306),
          username: configService.get<string>('DB_USERNAME', 'root'),
          password: configService.get<string>('DB_PASSWORD', ''),
          database: configService.get<string>('DB_DATABASE', 'shopify_app'),
          entities,
          synchronize: !isProduction,
          logging: !isProduction,
          charset: 'utf8mb4',
          timezone: '+08:00',
          // cache: {
          //   type: "redis",
          //   options: {
          //     host: configService.get<string>('REDIS_HOST', 'localhost'),
          //     port: configService.get<number>('REDIS_PORT', 6379),
          //     username: configService.get<string>('REDIS_USERNAME'),
          //     password: configService.get<string>('REDIS_PASSWORD')
          //   },
          //   duration: 60000
          // }
        };
      },
      inject: [ConfigService],
    }),

    TypeOrmModule.forFeature([ShopSessionEntity, ShopOrderEntity, ShopProductEntity, UserEntity, ShopEntity, UserShopEntity, PendingEventEntity, SyncRecordEntity]),

    ShopModule,
    ShopifyModule,
    WebhookModule,
    BillingModule,
    OrdersModule,
    ProductsModule,
    SyncModule,
    RedisModule,
    UserAuthModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
