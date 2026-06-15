import {
  Injectable,
  NestMiddleware,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * Webhook HMAC 验证中间件
 * 
 * Shopify Webhook 使用 HMAC-SHA256 签名验证请求的真实性
 * 必须验证原始请求体（raw body），不能使用已解析的 JSON
 * 
 * 为什么必须验证原始请求体？
 * - JSON 解析可能改变数据格式（如空格、顺序）
 * - HMAC 签名基于原始字节，任何变化都会导致验证失败
 * - 这是 Shopify 官方推荐的安全实践
 * 
 * 验证流程：
 * 1. 从 header 获取 x-shopify-hmac-sha256
 * 2. 使用 API Secret 对原始请求体计算 HMAC
 * 3. 比较计算结果与 header 中的签名
 */
@Injectable()
export class WebhookHmacMiddleware implements NestMiddleware {
  private readonly logger = new Logger(WebhookHmacMiddleware.name);

  constructor(private readonly configService: ConfigService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    try {
      // 获取原始请求体（Buffer）
      // 注意：需要在 main.ts 中配置 express.raw() 中间件
      const rawBody = req.body;

      if (!Buffer.isBuffer(rawBody)) {
        this.logger.error('Request body is not a Buffer. Ensure express.raw() middleware is configured.');
        throw new UnauthorizedException('Invalid request body format');
      }

      // 获取 HMAC 签名
      const hmacHeader = req.headers['x-shopify-hmac-sha256'] as string;

      if (!hmacHeader) {
        this.logger.warn('Missing HMAC signature header');
        throw new UnauthorizedException('Missing HMAC signature');
      }

      // 验证 HMAC
      const isValid = this.verifyHmac(rawBody, hmacHeader);

      if (!isValid) {
        this.logger.warn('HMAC verification failed');
        throw new UnauthorizedException('Invalid HMAC signature');
      }

      // 解析 JSON 并赋给 req.body
      try {
        const jsonString = rawBody.toString('utf-8');
        req.body = JSON.parse(jsonString);
      } catch (parseError) {
        this.logger.error('Failed to parse webhook body as JSON');
        throw new UnauthorizedException('Invalid JSON payload');
      }

      // 记录 Webhook 信息
      const topic = req.headers['x-shopify-topic'] as string;
      const shop = req.headers['x-shopify-shop-domain'] as string;
      this.logger.debug(`Webhook verified: ${topic} from ${shop}`);

      next();
    } catch (error: any) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(`Webhook verification error: ${error.message}`, error.stack);
      throw new UnauthorizedException('Webhook verification failed');
    }
  }

  /**
   * 验证 HMAC 签名
   * 
   * @param rawBody 原始请求体（Buffer）
   * @param hmacHeader header 中的 HMAC 签名
   * @returns 是否验证通过
   */
  private verifyHmac(rawBody: Buffer, hmacHeader: string): boolean {
    const apiSecret = this.configService.get<string>('SHOPIFY_API_SECRET');

    if (!apiSecret) {
      this.logger.error('SHOPIFY_API_SECRET is not configured');
      return false;
    }

    // 计算 HMAC-SHA256
    const calculatedHmac = crypto
      .createHmac('sha256', apiSecret)
      .update(rawBody)
      .digest('base64');

    // 使用时间安全的比较方法
    // 防止时序攻击（timing attack）
    return this.safeCompare(calculatedHmac, hmacHeader);
  }

  /**
   * 时间安全的字符串比较
   * 防止时序攻击
   */
  private safeCompare(a: string, b: string): boolean {
    // 使用 Node.js 内置的 crypto.timingSafeEqual
    // 需要将字符串转换为 Buffer
    try {
      const bufA = Buffer.from(a, 'base64');
      const bufB = Buffer.from(b, 'base64');

      if (bufA.length !== bufB.length) {
        return false;
      }

      return crypto.timingSafeEqual(bufA, bufB);
    } catch {
      return false;
    }
  }
}