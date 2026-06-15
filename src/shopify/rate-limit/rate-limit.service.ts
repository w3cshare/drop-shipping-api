import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Shopify API 限流服务
 * 
 * Shopify API 有严格的限流规则：
 * - REST API: 每分钟 2 点/秒，突发限制 40 点
 * - GraphQL API: 基于 cost 计算，每分钟 50 点/秒
 * 
 * 本服务实现：
 * - 指数退避重试（处理 429 状态码）
 * - 解析 GraphQL 响应中的 extensions.cost 主动延迟
 * - 批量数据处理支持
 */
@Injectable()
export class ShopifyRateLimitService {
  private readonly logger = new Logger(ShopifyRateLimitService.name);

  // 限流配置
  private readonly maxRetries = 5;
  private readonly initialDelayMs = 1000;
  private readonly maxDelayMs = 60000;

  constructor(private readonly configService: ConfigService) {}

  /**
   * 使用指数退避重试执行请求
   * 
   * 当遇到 429 状态码时：
   * 1. 解析 Retry-After header 或 GraphQL cost 信息
   * 2. 等待指定时间后重试
   * 3. 使用指数退避策略增加等待时间
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    retryCount = 0,
  ): Promise<T> {
    try {
      const result = await operation();

      // 检查 GraphQL 响应中的 cost 信息，主动延迟
      if (result && typeof result === 'object' && 'extensions' in result) {
        await this.handleCostThrottling(result.extensions as any);
      }

      return result;
    } catch (error: any) {
      // 检查是否是限流错误
      if (this.isRateLimitError(error)) {
        if (retryCount >= this.maxRetries) {
          throw new Error(`Max retries (${this.maxRetries}) exceeded for rate-limited request`);
        }

        // 计算等待时间
        const delayMs = this.calculateDelay(error, retryCount);
        this.logger.warn(
          `Rate limit hit, retrying in ${delayMs}ms (attempt ${retryCount + 1}/${this.maxRetries})`,
        );

        // 等待后重试
        await this.sleep(delayMs);
        return this.executeWithRetry(operation, retryCount + 1);
      }

      // 其他错误直接抛出
      throw error;
    }
  }

  /**
   * 检查是否是限流错误
   */
  private isRateLimitError(error: any): boolean {
    // HTTP 429 状态码
    if (error.status === 429 || error.statusCode === 429) {
      return true;
    }

    // GraphQL 错误中可能包含限流信息
    if (error.message && error.message.includes('Throttled')) {
      return true;
    }

    // Shopify API 特定的限流错误
    if (error.errors && Array.isArray(error.errors)) {
      return error.errors.some(
        (e: any) =>
          e.message?.includes('rate limit') ||
          e.message?.includes('throttled') ||
          e.extensions?.code === 'THROTTLED',
      );
    }

    return false;
  }

  /**
   * 计算等待时间
   */
  private calculateDelay(error: any, retryCount: number): number {
    // 尝试从 Retry-After header 获取等待时间
    const retryAfter = error.headers?.['retry-after'] || error.headers?.['Retry-After'];
    if (retryAfter) {
      const retryAfterMs = parseInt(retryAfter, 10) * 1000;
      return Math.min(retryAfterMs, this.maxDelayMs);
    }

    // 尝试从 GraphQL cost 信息获取等待时间
    if (error.extensions?.cost) {
      const cost = error.extensions.cost;
      const waitTime = this.calculateCostWaitTime(cost);
      if (waitTime > 0) {
        return Math.min(waitTime, this.maxDelayMs);
      }
    }

    // 使用指数退避
    const exponentialDelay = this.initialDelayMs * Math.pow(2, retryCount);
    return Math.min(exponentialDelay, this.maxDelayMs);
  }

  /**
   * 根据 GraphQL cost 计算等待时间
   * 
   * Shopify GraphQL cost 结构：
   * {
   *   "cost": {
   *     "requestedQueryCost": 10,
   *     "actualQueryCost": 10,
   *     "throttleStatus": {
   *       "maximumAvailable": 1000,
   *       "currentlyAvailable": 990,
   *       "restoreRate": 50
   *     }
   *   }
   * }
   */
  private calculateCostWaitTime(cost: any): number {
    if (!cost?.throttleStatus) {
      return 0;
    }

    const { maximumAvailable, currentlyAvailable, restoreRate } = cost.throttleStatus;

    // 如果当前可用点数接近最大值，不需要等待
    if (currentlyAvailable > maximumAvailable * 0.8) {
      return 0;
    }

    // 计算需要等待的时间（秒）
    const deficit = maximumAvailable - currentlyAvailable;
    const waitSeconds = deficit / restoreRate;

    return Math.ceil(waitSeconds * 1000);
  }

  /**
   * 处理 GraphQL cost throttling
   * 主动延迟以避免触发限流
   */
  private async handleCostThrottling(extensions: any): Promise<void> {
    if (!extensions?.cost?.throttleStatus) {
      return;
    }

    const waitTime = this.calculateCostWaitTime(extensions.cost);
    if (waitTime > 0) {
      this.logger.debug(`Proactive throttling: waiting ${waitTime}ms`);
      await this.sleep(waitTime);
    }
  }

  /**
   * 等待指定时间
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 执行批量请求
   * 自动控制请求速率以避免限流
   */
  async executeBatch<T>(
    operations: Array<() => Promise<T>>,
    concurrency = 2,
  ): Promise<T[]> {
    const results: T[] = [];

    for (let i = 0; i < operations.length; i += concurrency) {
      const batch = operations.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(op => this.executeWithRetry(op)),
      );
      results.push(...batchResults);

      // 批次间添加延迟以避免限流
      if (i + concurrency < operations.length) {
        await this.sleep(500);
      }
    }

    return results;
  }
}