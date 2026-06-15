import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import * as redisStore from 'cache-manager-redis-store';

@Module({
  imports: [
    CacheModule.register({
      store: redisStore,
      host: '192.168.1.5',
      port: 6379,
      username: 'default',
      password: '6eHZOIXKBEu2Bfz3',
      ttl: 60000,
    }),
  ],
  exports: [CacheModule],
})
export class RedisModule {}
