import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import * as express from 'express';

/**
 * 应用入口文件
 * 
 * 配置 NestJS 应用，包括：
 * - 原始请求体中间件（用于 Webhook HMAC 验证）
 * - CORS 配置（允许 Shopify 嵌入式应用）
 * - 全局管道和异常过滤器
 */
async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule);

  // 配置原始请求体中间件
  // 重要：Webhook HMAC 验证需要原始请求体（raw body）
  // 必须在 JSON 解析之前获取原始 Buffer
  app.use('/webhooks', express.raw({ type: 'application/json' }));

  // 配置 CORS
  // Shopify 嵌入式应用需要允许跨域请求
  app.enableCors({
    origin: true, // 允许所有来源（生产环境应限制）
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Shopify-Access-Token',
      'X-Shopify-Hmac-Sha256',
      'X-Shopify-Shop-Domain',
      'X-Shopify-Topic',
    ],
  });

  // 获取端口配置
  const port = process.env.PORT || 3000;

  await app.listen(port, '0.0.0.0');

  logger.log(`Application is running on: http://0.0.0.0:${port}`);
  logger.log(`Shopify OAuth callback URL: http://localhost:${port}/auth/callback`);
  logger.log(`Webhook endpoint: http://localhost:${port}/webhooks`);
}

bootstrap();