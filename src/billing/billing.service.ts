import { Injectable, Logger } from '@nestjs/common';
import { ShopifyGraphqlService } from '../shopify/graphql/graphql.service';

/**
 * Shopify 订阅计费服务
 * 
 * 用于管理 Shopify App Pricing 计费方案
 * 
 * 定价方案在 Partner Dashboard 中配置，代码只需：
 * 1. 查询当前订阅状态
 * 2. 上报使用量（用于按量计费）
 * 
 * 支持的计费模式：
 * - One-time charge: 一次性收费
 * - Recurring charge: 按月/年订阅
 * - Usage-based charge: 按量计费（需要上报使用量）
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(private readonly graphqlService: ShopifyGraphqlService) {}

  /**
   * 获取当前活跃订阅
   * 
   * 通过 CurrentAppInstallation.activeSubscriptions 查询
   * 返回当前店铺的订阅状态信息
   */
  async getActiveSubscription(shop: string): Promise<any> {
    try {
      const query = `
        query GetActiveSubscription {
          currentAppInstallation {
            activeSubscriptions {
              id
              name
              status
              test
              createdAt
              lineItems {
                id
              }
            }
          }
        }
      `;

      const result = await this.graphqlService.query<{ currentAppInstallation: any }>(
        shop,
        query,
      );

      const subscriptions = result.currentAppInstallation?.activeSubscriptions;

      if (!subscriptions || subscriptions.length === 0) {
        return null;
      }

      // 返回第一个活跃订阅（通常只有一个）
      return subscriptions[0];
    } catch (error: any) {
      this.logger.error(`Failed to get active subscription for shop ${shop}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 检查是否有活跃订阅
   */
  async hasActiveSubscription(shop: string): Promise<boolean> {
    try {
      const subscription = await this.getActiveSubscription(shop);
      return subscription && subscription.status === 'ACTIVE';
    } catch (error: any) {
      this.logger.error(`Failed to check subscription status: ${error.message}`);
      return false;
    }
  }

  /**
   * 上报使用量
   * 
   * 用于按量计费模式，上报客户的使用量
   * 通过 AppEvents API 记录使用事件
   * 
   * @param shop 店铺域名
   * @param eventName 使用事件名称（必须在定价方案中定义）
   * @param quantity 使用量
   */
  async reportUsage(shop: string, eventName: string, quantity: number): Promise<any> {
    try {
      // 首先获取当前订阅信息
      const subscription = await this.getActiveSubscription(shop);

      if (!subscription) {
        throw new Error('No active subscription found');
      }

      // 找到对应的 Usage Pricing line item
      const usageLineItem = subscription.lineItems?.find(
        (item: any) => item.plan?.pricingDetails?.terms === eventName,
      );

      if (!usageLineItem) {
        throw new Error(`No usage pricing found for event: ${eventName}`);
      }

      // 上报使用量（使用 appUsageRecordCreate mutation）
      const mutation = `
        mutation ReportUsage($lineItemId: ID!, $description: String!, $quantity: Int!) {
          appUsageRecordCreate(
            lineItemId: $lineItemId
            description: $description
            quantity: $quantity
          ) {
            appUsageRecord {
              id
              description
              quantity
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const result = await this.graphqlService.query<{ appUsageRecordCreate: any }>(
        shop,
        mutation,
        {
          lineItemId: usageLineItem.id,
          description: eventName,
          quantity,
        },
      );

      if (result.appUsageRecordCreate.userErrors && result.appUsageRecordCreate.userErrors.length > 0) {
        throw new Error(result.appUsageRecordCreate.userErrors.map((e: any) => e.message).join(', '));
      }

      this.logger.log(`Usage reported for shop ${shop}: ${eventName} = ${quantity}`);

      return result.appUsageRecordCreate.appUsageRecord;
    } catch (error: any) {
      this.logger.error(`Failed to report usage for shop ${shop}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 创建订阅
   * 
   * 注意：通常订阅通过前端 App Bridge 创建
   * 这里提供后端创建的方法（用于特殊场景）
   */
  async createSubscription(
    shop: string,
    name: string,
    returnUrl: string,
    test = false,
    trialDays = 0,
  ): Promise<any> {
    try {
      const mutation = `
        mutation CreateSubscription($name: String!, $returnUrl: URL!, $test: Boolean!, $trialDays: Int!) {
          appSubscriptionCreate(
            name: $name
            returnUrl: $returnUrl
            test: $test
            trialDays: $trialDays
            lineItems: [
              {
                plan: {
                  appRecurringPricingDetails: {
                    price: { amount: 10, currencyCode: USD }
                    interval: MONTHLY
                  }
                }
              }
            ]
          ) {
            appSubscription {
              id
              name
              status
            }
            confirmationUrl
            userErrors {
              field
              message
            }
          }
        }
      `;

      const result = await this.graphqlService.query<{ appSubscriptionCreate: any }>(
        shop,
        mutation,
        {
          name,
          returnUrl,
          test,
          trialDays,
        },
      );

      if (result.appSubscriptionCreate.userErrors && result.appSubscriptionCreate.userErrors.length > 0) {
        throw new Error(result.appSubscriptionCreate.userErrors.map((e: any) => e.message).join(', '));
      }

      return {
        subscription: result.appSubscriptionCreate.appSubscription,
        confirmationUrl: result.appSubscriptionCreate.confirmationUrl,
      };
    } catch (error: any) {
      this.logger.error(`Failed to create subscription for shop ${shop}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 取消订阅
   */
  async cancelSubscription(shop: string, subscriptionId: string): Promise<boolean> {
    try {
      const mutation = `
        mutation CancelSubscription($subscriptionId: ID!) {
          appSubscriptionDelete(id: $subscriptionId) {
            appSubscription {
              id
              status
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const result = await this.graphqlService.query<{ appSubscriptionDelete: any }>(
        shop,
        mutation,
        { subscriptionId },
      );

      if (result.appSubscriptionDelete.userErrors && result.appSubscriptionDelete.userErrors.length > 0) {
        throw new Error(result.appSubscriptionDelete.userErrors.map((e: any) => e.message).join(', '));
      }

      this.logger.log(`Subscription cancelled for shop ${shop}: ${subscriptionId}`);

      return true;
    } catch (error: any) {
      this.logger.error(`Failed to cancel subscription: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * 获取订阅使用量统计
   */
  async getUsageStats(shop: string): Promise<any> {
    try {
      const subscription = await this.getActiveSubscription(shop);

      if (!subscription) {
        return null;
      }

      // 查询使用量详情
      const query = `
        query GetUsageStats($subscriptionId: ID!) {
          node(id: $subscriptionId) {
            ... on AppSubscription {
              id
              status
              lineItems {
                id
              }
            }
          }
        }
      `;

      const result = await this.graphqlService.query<{ node: any }>(
        shop,
        query,
        { subscriptionId: subscription.id },
      );

      return result.node?.lineItems;
    } catch (error: any) {
      this.logger.error(`Failed to get usage stats: ${error.message}`, error.stack);
      return null;
    }
  }
}