import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShopifyModule } from './shopify/shopify.module';
import { WebhookModule } from './webhooks/webhook.module';
import { BillingModule } from './billing/billing.module';
import { OrdersModule } from './orders/order.module';
import { RedisModule } from './database/redis/redis.module';
import { ShopSessionEntity } from './database/entities/shop-session.entity';
import { ShopOrderEntity } from './database/entities/order.entity';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local', '.env.development', '.env.production'],
    }),

    // TypeORM 数据库配置 - 使用 MySQL
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const isProduction = configService.get<string>('NODE_ENV') === 'production';
        const entities = [ShopSessionEntity, ShopOrderEntity];

        return {
          type: 'mysql' as const,
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
          //     host: "192.168.1.5",
          //     port: 6379,
          //     username: 'default',
          //     password: "6eHZOIXKBEu2Bfz3"
          //   },
          //   duration: 60000
          // }
        };
      },
      inject: [ConfigService],
    }),

    TypeOrmModule.forFeature([ShopSessionEntity, ShopOrderEntity]),

    ShopifyModule,
    WebhookModule,
    BillingModule,
    OrdersModule,
    RedisModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
